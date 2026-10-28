\encoding UTF8
-- =====================================================================
-- 現行システムからのデータ移行: CSV 投入（\copy）の後に実行する
--
-- 実行例（Windows の psql。<...> は環境に合わせる。test に投入したときは -v schema=test を付ける）:
--   psql -h <host> -U <user> -d <db> -v schema=public -f 02_after_load.sql
--   基準日（下記 4・5）を指定するとき: -v cutoff=2026-01-01 を付ける
--
-- 前提
--   ・20261028_seikyu_shime.sql / 20261028_seikyu_history.sql を適用済み（表の構造は TRUNCATE しても残る）
--   ・01_before_load.sql を実行し、trseikyu_load・trjyuden・trjyumei・trnyusub に CSV を投入済み
--
-- 行うこと（全体を 1 つのトランザクションで行う。途中でエラーになったら何も変わらない。何度実行してもよい）
--   1. 統計情報の更新（投入直後は古く、以降の処理が極端に遅くなるため）
--   2. 請求伝票: trseikyu_load を 1 伝票 1 行にまとめて trseikyu へ移す
--        ・部門別の複数行は金額を合計（bcode は最小の部門）
--        ・同一顧客・同一締め日に別番号がある場合、金額がすべて 0 の伝票は除く
--        ・作成日時等は NULL（= 現行システムから移行）。操作記録（tropelog）は残さない
--   3a. 受注伝票の伝票区分（返品）を jdstatus から denku に移し、ステータスを付け直す（20261028_jyuden_ship.sql を適用済みのこと）
--   3. 受注伝票 idenno（計上先の請求伝票）
--        ・都度請求・売上日なし → NULL
--        ・掛売で、売上日以降に締め日のある請求伝票がある → その請求伝票番号（請求済）
--        ・掛売で、それ以外 → 売上日が基準日以降なら NULL（次の締めで計上）、基準日より前なら 0（移行時に請求対象外）
--   4. 請求入金 kdenno（計上先の請求伝票）: 3 と同じ考え方（入金日で判定）
--   5. 基準日 = 指定がなければ「請求伝票の最終締め日の 2 か月前」
--        （その後に請求伝票の無い＝取引の止まった請求先の古い伝票を、次の締めで計上しないため）
--   6. 請求明細（trseikyusub）を作り直す
--   7. 採番（trnumber の idenno）を請求伝票番号の最大値以上にする。tropelog のシーケンスを合わせる
--   8. 結果の件数を表示する
-- =====================================================================
\set ON_ERROR_STOP on
\if :{?schema}
\else
  \set schema public
\endif
\if :{?cutoff}
\else
  \set cutoff ''
\endif
\timing on

BEGIN;
SET LOCAL search_path TO :"schema";

-- 1. 統計情報の更新
ANALYZE trseikyu_load;
ANALYZE trjyuden;
ANALYZE trjyumei;
ANALYZE trnyusub;

-- 2. 請求伝票
--    trseikyu を空にする（請求明細 trseikyusub も外部キーで一緒に空になる。6 で作り直す）
TRUNCATE trseikyu CASCADE;

ALTER TABLE trseikyu DISABLE TRIGGER trseikyu_opelog;

-- 移行した請求伝票は、現行システムで送付済なので進捗（sstatus）を 4 顧客送付済にする
INSERT INTO trseikyu (id, mcode, denno, sday, zenkai, nmon, tmon, taxmon, tax, seikyu, bcode,
                      kurikosi, del, created_at, created_by, updated_at, updated_by, sstatus)
WITH g AS (
  SELECT id, denno,
         min(mcode) AS mcode, min(sday) AS sday,
         sum(zenkai) AS zenkai, sum(nmon) AS nmon, sum(tmon) AS tmon,
         sum(taxmon) AS taxmon, sum(tax) AS tax, sum(seikyu) AS seikyu,
         min(bcode) AS bcode
    FROM trseikyu_load
   GROUP BY id, denno
), z AS (
  -- 同一顧客・同一締め日に別番号があり、金額がすべて 0 の伝票（除く）
  SELECT g.id, g.denno
    FROM g
   WHERE coalesce(g.zenkai, 0) = 0 AND coalesce(g.nmon, 0) = 0 AND coalesce(g.tmon, 0) = 0
     AND coalesce(g.taxmon, 0) = 0 AND coalesce(g.tax, 0) = 0 AND coalesce(g.seikyu, 0) = 0
     AND EXISTS (SELECT 1 FROM g k
                  WHERE k.id = g.id AND k.mcode = g.mcode AND k.sday = g.sday AND k.denno < g.denno)
)
SELECT g.id, g.mcode, g.denno, g.sday, g.zenkai, g.nmon, g.tmon, g.taxmon, g.tax, g.seikyu, g.bcode,
       coalesce(g.zenkai, 0) - coalesce(g.nmon, 0) - coalesce(g.tmon, 0),
       false, NULL, NULL, NULL, NULL, 4
  FROM g
 WHERE NOT EXISTS (SELECT 1 FROM z WHERE z.id = g.id AND z.denno = g.denno);
-- 金額のある請求伝票同士が同一顧客・同一締め日で重なっていると、一意インデックス
-- trseikyu_mcode_sday_key の違反でここで止まる（そのときは CSV の該当伝票を確認する）

ALTER TABLE trseikyu ENABLE TRIGGER trseikyu_opelog;
ANALYZE trseikyu;

-- 基準日
CREATE TEMP TABLE mig_param ON COMMIT DROP AS
SELECT coalesce(nullif(:'cutoff', '')::date,
                ((SELECT max(sday) FROM trseikyu) - interval '2 months')::date) AS cutoff;

-- 3a. 受注伝票の伝票区分・ステータス（jyuden.sql は jdstatus に現行の denku（0 通常 / 2 返品）を出している）
--     出荷予定日が今日より前の伝票は 4 出荷指示出力済、それ以外は 2 受注登録にする
UPDATE trjyuden
   SET denku = CASE WHEN jdstatus = '2' THEN 2 ELSE 0 END,
       jdstatus = CASE WHEN sday < current_date THEN '40' ELSE '20' END;

-- 3. 受注伝票 idenno
UPDATE trjyuden SET idenno = NULL
 WHERE idenno IS NOT NULL AND (torikbn IS NOT TRUE OR uday IS NULL);

-- NOT s.del は、部分一意インデックス trseikyu_mcode_sday_key（WHERE NOT del）を使わせるための条件
-- （無いと受注伝票 1 件ごとに請求伝票を全件走査し、何時間もかかる）
UPDATE trjyuden j
   SET idenno = coalesce((SELECT s.denno FROM trseikyu s
                           WHERE s.id = j.id AND s.mcode = j.scde AND s.sday >= j.uday AND NOT s.del
                           ORDER BY s.sday LIMIT 1), 0)
 WHERE j.torikbn AND j.uday IS NOT NULL;

UPDATE trjyuden SET idenno = NULL
 WHERE torikbn AND idenno = 0 AND uday >= (SELECT cutoff FROM mig_param);

-- 4. 請求入金 kdenno
UPDATE trnyusub n
   SET kdenno = coalesce((SELECT s.denno FROM trseikyu s
                           WHERE s.id = n.id AND s.mcode = n.mcode AND s.sday >= n.day AND NOT s.del
                           ORDER BY s.sday LIMIT 1), 0)
 WHERE n.kubun = 1;

UPDATE trnyusub SET kdenno = NULL
 WHERE kubun = 1 AND kdenno = 0 AND day >= (SELECT cutoff FROM mig_param);

-- 6. 請求明細（trseikyusub）
INSERT INTO trseikyusub (id, denno, line, kind, refdenno, day, taxmon, tax, total, created_at, created_by)
WITH jj AS (
  SELECT j.id, j.idenno AS denno, j.denno AS refdenno, j.uday AS day,
         CASE WHEN j.denku = 2 THEN -1 ELSE 1 END AS sign
    FROM trjyuden j
    JOIN trseikyu s ON s.id = j.id AND s.denno = j.idenno
   WHERE j.idenno > 0
), mm AS (
  SELECT m.id, m.denno, sum(m.toutmoney) AS taxmon, sum(m.taxmoney) AS tax
    FROM trjyumei m
    JOIN jj ON jj.id = m.id AND jj.refdenno = m.denno
   WHERE m.del IS NOT TRUE
   GROUP BY m.id, m.denno
)
SELECT jj.id, jj.denno,
       row_number() OVER (PARTITION BY jj.id, jj.denno ORDER BY jj.day, jj.refdenno),
       'J', jj.refdenno, jj.day,
       jj.sign * coalesce(mm.taxmon, 0),
       jj.sign * coalesce(mm.tax, 0),
       jj.sign * (coalesce(mm.taxmon, 0) + coalesce(mm.tax, 0)),
       now(), 'migration'
  FROM jj
  LEFT JOIN mm ON mm.id = jj.id AND mm.denno = jj.refdenno;

INSERT INTO trseikyusub (id, denno, line, kind, refdenno, day, nmoney, smoney, tmoney, memo, created_at, created_by)
SELECT n.id, n.kdenno,
       coalesce(j.maxline, 0) + row_number() OVER (PARTITION BY n.id, n.kdenno ORDER BY n.day, n.denno),
       'N', n.denno, n.day, n.nmoney, n.smoney, n.tmoney, n.memo,
       now(), 'migration'
  FROM trnyusub n
  JOIN trseikyu s ON s.id = n.id AND s.denno = n.kdenno
  LEFT JOIN (SELECT id, denno, max(line) AS maxline FROM trseikyusub GROUP BY id, denno) j
         ON j.id = n.id AND j.denno = n.kdenno
 WHERE n.kubun = 1 AND n.kdenno > 0;

-- 7. 採番・シーケンス
INSERT INTO trnumber (id, type, curnum)
SELECT DISTINCT s.id, 'idenno', 0 FROM trseikyu s
 WHERE NOT EXISTS (SELECT 1 FROM trnumber n WHERE n.id = s.id AND n.type = 'idenno');
UPDATE trnumber n
   SET curnum = greatest(n.curnum, (SELECT max(s.denno) FROM trseikyu s WHERE s.id = n.id))
 WHERE n.type = 'idenno'
   AND EXISTS (SELECT 1 FROM trseikyu s WHERE s.id = n.id);

SELECT setval(pg_get_serial_sequence('tropelog', 'sequ'), (SELECT max(sequ) FROM tropelog));

-- 8. 結果
SELECT '請求伝票（CSV の行数）' AS 項目, count(*)::text AS 値 FROM trseikyu_load
UNION ALL SELECT '請求伝票（移行後）', count(*)::text FROM trseikyu
UNION ALL SELECT '請求伝票 最終締め日 / 基準日', max(sday)::text || ' / ' || (SELECT cutoff FROM mig_param)::text FROM trseikyu
UNION ALL SELECT '受注 掛売 請求済(>0)', count(*)::text FROM trjyuden WHERE torikbn AND idenno > 0
UNION ALL SELECT '受注 掛売 移行時に請求対象外(=0)', count(*)::text FROM trjyuden WHERE torikbn AND idenno = 0
UNION ALL SELECT '受注 掛売 次の締めで計上（売上日あり）', count(*)::text || ' 件（売上日 ' || coalesce(min(uday)::text, '-') || ' ～ ' || coalesce(max(uday)::text, '-') || '）'
  FROM trjyuden WHERE torikbn AND idenno IS NULL AND uday IS NOT NULL AND (del IS NULL OR del = false)
UNION ALL SELECT '請求入金 計上済(>0)', count(*)::text FROM trnyusub WHERE kubun = 1 AND kdenno > 0
UNION ALL SELECT '請求入金 移行時に計上対象外(=0)', count(*)::text FROM trnyusub WHERE kubun = 1 AND kdenno = 0
UNION ALL SELECT '請求入金 次の締めで計上', count(*)::text || ' 件（入金日 ' || coalesce(min(day)::text, '-') || ' ～ ' || coalesce(max(day)::text, '-') || '）'
  FROM trnyusub WHERE kubun = 1 AND kdenno IS NULL AND del IS NULL
UNION ALL SELECT '請求明細 受注(J) / 入金(N)', count(*) FILTER (WHERE kind = 'J') || ' / ' || count(*) FILTER (WHERE kind = 'N') FROM trseikyusub
UNION ALL SELECT '採番 idenno', string_agg(curnum::text, ', ') FROM trnumber WHERE type = 'idenno';

-- 01_before_load.sql で止めた受注伝票の操作の記録を戻す
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = to_regclass('trjyuden') AND tgname = 'trjyuden_opelog') THEN
    ALTER TABLE trjyuden ENABLE TRIGGER trjyuden_opelog;
  END IF;
END
$$;

COMMIT;
