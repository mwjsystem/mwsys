\encoding UTF8
-- =====================================================================
-- データ移行 5: 採番を合わせる・投入結果の確認（会社ごと）
--
-- 実行例: psql -X -v schema=test -v comp=1 -f 05_finish.sql
--
-- 行うこと
--   1. 採番（trnumber）を、投入した伝票の最大の番号以上にする（小さくはしない。無い種別は作る）
--        jdenno 受注（返品の +20000000 / +30000000 は除く）/ hdenno 発注 / sdenno 仕入 / mdenno 移動
--        ndenno 入金 / tdenno 展開 / cdenno 在庫調整 / gdenno 発注外入荷（idenno 請求は 02_after_load.sql）
--   2. 表ごとの件数（会社ごと）・日付の範囲
--   3. Amazon・新極真まわりの確認
--   4. 操作ログ（tropelog）のシーケンス
--   5. 受注明細の構成品（trjyumzai）を作る（現行に無い。旧 work\移行用SQL\trjyumzai.sql を INSERT にした）
-- =====================================================================
\set ON_ERROR_STOP on
\if :{?schema}
\else
  \set schema public
\endif
\if :{?comp}
\else
  \echo '-v comp=<会社ID> を指定してください（マーシャル 1 / 東海堂 2）'
  \quit
\endif

BEGIN;
SET LOCAL search_path TO :"schema";

-- 1. 採番
CREATE TEMP TABLE mig_num ON COMMIT DROP AS
SELECT 'jdenno' AS type, (SELECT max(denno) FROM trjyuden WHERE id = :comp AND denno < 20000000) AS maxno
UNION ALL SELECT 'hdenno', (SELECT max(denno) FROM trhatden WHERE id = :comp)
UNION ALL SELECT 'sdenno', (SELECT max(denno) FROM trsiiden WHERE id = :comp)
UNION ALL SELECT 'mdenno', (SELECT max(denno) FROM trmovsub WHERE id = :comp)
UNION ALL SELECT 'ndenno', (SELECT max(denno) FROM trnyuden WHERE id = :comp)
UNION ALL SELECT 'tdenno', (SELECT max(denno) FROM trtenden WHERE id = :comp)
UNION ALL SELECT 'cdenno', (SELECT max(denno) FROM trchoden WHERE id = :comp)
UNION ALL SELECT 'gdenno', (SELECT max(denno) FROM trhgnden WHERE id = :comp);

SELECT n.type AS 種別, t.curnum AS 今の番号, n.maxno AS 伝票の最大,
       CASE WHEN t.curnum IS NULL THEN '作る' WHEN t.curnum < n.maxno THEN '合わせる' ELSE 'そのまま' END AS 処理
  FROM mig_num n LEFT JOIN trnumber t ON t.id = :comp AND t.type = n.type
 ORDER BY n.type;

INSERT INTO trnumber (id, type, curnum)
SELECT :comp, n.type, coalesce(n.maxno, 0) FROM mig_num n
 WHERE NOT EXISTS (SELECT 1 FROM trnumber t WHERE t.id = :comp AND t.type = n.type);
UPDATE trnumber t SET curnum = n.maxno
  FROM mig_num n
 WHERE t.id = :comp AND t.type = n.type AND n.maxno IS NOT NULL AND t.curnum < n.maxno;

-- 4. 操作ログのシーケンス
SELECT setval(pg_get_serial_sequence('tropelog', 'sequ'), (SELECT max(sequ) FROM tropelog));

-- 5. 受注明細の構成品（trjyumzai）: 現行に無いので、投入した受注明細と商品の構成品（msgzai）から作る
--    （work\移行用SQL\trjyumzai.sql と同じ条件: 出荷日 2022-06-02 以降、非在庫（gskbn 2）以外）
ALTER TABLE trjyumzai DISABLE TRIGGER USER;
DELETE FROM trjyumzai WHERE id = :comp;
INSERT INTO trjyumzai (id, denno, line, eda, gcode, suu, genka, spec, spdet)
SELECT m.id, m.denno, m.line,
       row_number() OVER (PARTITION BY m.id, m.denno, m.line ORDER BY z.zcode),
       z.zcode, m.suu * z.irisu, 0, '1', ''
  FROM trjyumei m
  JOIN msgoods g ON g.id = m.id AND g.gcode = m.gcode
  JOIN msgzai z  ON z.id = g.id AND z.gcode = g.gcode
 WHERE m.id = :comp
   AND m.sday > '2022-06-01'
   AND g.gskbn <> '2';
ALTER TABLE trjyumzai ENABLE TRIGGER USER;
SELECT '受注明細の構成品（trjyumzai）' AS 項目, count(*) AS 件数 FROM trjyumzai WHERE id = :comp;

COMMIT;

-- 2. 件数（会社ごと。他の会社の行は東海堂の移行まで触らない）
SELECT tbl AS 表,
       (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM %I.%I WHERE id = %s', :'schema', tbl, :'comp'), false, true, '')))[1]::text AS 件数,
       (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM %I.%I WHERE id <> %s', :'schema', tbl, :'comp'), false, true, '')))[1]::text AS 他の会社
  FROM unnest(ARRAY['msgoods', 'msgtanka', 'msgzai', 'msmember', 'msmadr', 'msvendor',
                    'trjyuden', 'trjyumei', 'trhatden', 'trhatmei', 'trsiiden', 'trsiimei',
                    'trmovsub', 'trmovden', 'trtenden', 'trchoden', 'trhgnden', 'trzaiko', 'trgtana',
                    'trseikyu', 'trseikyusub', 'trnyuden', 'trnyusub']) AS tbl
 WHERE to_regclass(:'schema' || '.' || tbl) IS NOT NULL;

SET search_path TO :"schema";
SELECT '受注 受注日の範囲' AS 項目, min(day)::text || ' ～ ' || max(day)::text AS 値 FROM trjyuden WHERE id = :comp
UNION ALL SELECT '受注 返品（denku=2）', count(*)::text FROM trjyuden WHERE id = :comp AND denku = 2
UNION ALL SELECT '受注 明細の無い伝票', count(*)::text FROM trjyuden j WHERE j.id = :comp AND NOT EXISTS (SELECT 1 FROM trjyumei m WHERE m.id = j.id AND m.denno = j.denno)
UNION ALL SELECT '受注 顧客マスタに無い受注先', count(DISTINCT j.mcode)::text FROM trjyuden j WHERE j.id = :comp AND NOT EXISTS (SELECT 1 FROM msmember m WHERE m.id = j.id AND m.mcode = j.mcode)
UNION ALL SELECT '受注明細 商品マスタに無い商品', count(DISTINCT m.gcode)::text FROM trjyumei m WHERE m.id = :comp AND m.gcode IS NOT NULL AND NOT EXISTS (SELECT 1 FROM msgoods g WHERE g.id = m.id AND g.gcode = m.gcode)
UNION ALL SELECT '発注 発注日の範囲', min(day)::text || ' ～ ' || max(day)::text FROM trhatden WHERE id = :comp
UNION ALL SELECT '仕入 仕入日の範囲', min(inday)::text || ' ～ ' || max(inday)::text FROM trsiiden WHERE id = :comp
UNION ALL SELECT '在庫 日付の範囲', min(day)::text || ' ～ ' || max(day)::text FROM trzaiko WHERE id = :comp
-- 3. Amazon（408223）: 送り状番号の重複チェック・PO（客先伝票番号 cusden）での取込済みチェックに使う
UNION ALL SELECT 'Amazon 受注 / うち PO(cusden) あり（直近 1 年）',
       count(*)::text || ' / ' || count(*) FILTER (WHERE nullif(trim(cusden), '') IS NOT NULL)::text
  FROM trjyuden WHERE id = :comp AND trim(mcode) = '408223' AND day >= current_date - 365
UNION ALL SELECT 'Amazon 受注 送り状番号あり', count(*)::text FROM trjyuden WHERE id = :comp AND trim(mcode) = '408223' AND nullif(trim(okurino), '') IS NOT NULL
UNION ALL SELECT 'Amazon 受注 納品書タイプ（buntype 別の件数・直近 1 年）', string_agg(b || ':' || n, ', ')
  FROM (SELECT coalesce(buntype, '(空)') AS b, count(*) AS n FROM trjyuden WHERE id = :comp AND trim(mcode) = '408223' AND day >= current_date - 365 GROUP BY 1 ORDER BY 1) x
-- Amazon の移行した受注残（送り状番号なし）: 新システムの Amazon 納品書は PO を cusden、着荷ウィンドウを伝票備考の「着荷ウィンドウ …」から出す
UNION ALL SELECT 'Amazon 受注残（送り状番号なし） / うち PO(cusden) なし / うち伝票備考に「着荷ウィンドウ」なし',
       count(*)::text || ' / ' || count(*) FILTER (WHERE nullif(trim(cusden), '') IS NULL)::text
       || ' / ' || count(*) FILTER (WHERE coalesce(dmemo, '') NOT LIKE '%着荷ウィンドウ%')::text
  FROM trjyuden WHERE id = :comp AND trim(mcode) = '408223' AND coalesce(denku, 0) <> 2 AND (del IS NULL OR del = false)
   AND nullif(trim(okurino), '') IS NULL AND day >= current_date - 90
-- 新極真（大分類 100004）: ロイヤリティは伝票備考＋納品書備考の「M/D受注」で受注日を決める。直近 2 か月で「受注」が無い伝票
UNION ALL SELECT '新極真 100004 の受注（直近 2 か月） / うち伝票備考・納品書備考に「受注」なし',
       count(*)::text || ' / ' || count(*) FILTER (WHERE coalesce(dmemo, '') || coalesce(nmemo, '') NOT LIKE '%受注%')::text
  FROM trjyuden WHERE id = :comp AND daibunrui = '100004' AND (del IS NULL OR del = false) AND day >= current_date - 61
-- 新極真: 現行の ZZ0000093039 は受注伝票では 60 に読み替えている（jyuden_1.sql）。顧客マスタ側の状態
UNION ALL SELECT '顧客 ZZ0000093039 / 60 の有無', (SELECT count(*) FROM msmember WHERE id = :comp AND mcode = 'ZZ0000093039') || ' / ' || (SELECT count(*) FROM msmember WHERE id = :comp AND mcode = '60')
UNION ALL SELECT '新極真 ロイヤリティ対象の顧客で顧客マスタに無いもの', count(*)::text
  FROM msroymem r WHERE r.id = :comp AND nullif(trim(r.mcode), '') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM msmember m WHERE m.id = r.id AND m.mcode = trim(r.mcode));
