-- =====================================================================
-- 掛売請求の締め処理（frminvoice）用のテーブル変更と、既存（移行）データの整備
--
-- 適用方法: Hasura コンソール > Data > SQL で、先頭の search_path を
--   test（テスト）/ public（本番）に切り替えて 1 回ずつ実行する（テストから先に）。
--   全体が 1 トランザクションで実行されるため、途中でエラーになった場合は何も変更されない。
--   実行後、Hasura で「Reload metadata」し、権限を見直す（末尾の注記参照）。
-- =====================================================================
SET search_path TO public;  -- テスト環境に適用するときは test に変更

-- ---------------------------------------------------------------------
-- 0. 変更前の請求伝票をバックアップ
-- ---------------------------------------------------------------------
CREATE TABLE trseikyu_bak20261028 AS SELECT * FROM trseikyu;

-- ---------------------------------------------------------------------
-- 1. 部門（bcode）別に複数行ある請求伝票を 1 伝票 1 行にまとめる
--    現行システムでは 1 枚の請求伝票（同じ denno・顧客・締め日）が部門別の行に
--    分かれていることがある（141 件）。金額は合計し、bcode は行数の多い部門を残す。
--    元の部門別の行は trseikyu_bak20261028 に残る。
-- ---------------------------------------------------------------------
CREATE TEMP TABLE seikyu_merge ON COMMIT DROP AS
SELECT id, denno,
       min(mcode)  AS mcode,
       min(sday)   AS sday,
       sum(zenkai) AS zenkai,
       sum(nmon)   AS nmon,
       sum(tmon)   AS tmon,
       sum(taxmon) AS taxmon,
       sum(tax)    AS tax,
       sum(seikyu) AS seikyu,
       min(bcode)  AS bcode
  FROM trseikyu
 GROUP BY id, denno
HAVING count(*) > 1;

DELETE FROM trseikyu s USING seikyu_merge m WHERE s.id = m.id AND s.denno = m.denno;
INSERT INTO trseikyu (id, mcode, denno, sday, zenkai, nmon, tmon, taxmon, tax, seikyu, bcode)
SELECT id, mcode, denno, sday, zenkai, nmon, tmon, taxmon, tax, seikyu, bcode FROM seikyu_merge;

-- ---------------------------------------------------------------------
-- 1b. 同一顧客・同一締め日に別番号の請求伝票がある場合、金額がすべて 0 の伝票を削除する
--     （2026-10-28 時点: 顧客 24985 / 2010-12 締めの 3001223。3001140 を残す）
--     削除する伝票を参照している受注伝票・請求入金伝票は、残す伝票に付け替える。
--     金額のある伝票同士が重なっている場合は削除せず、後の UNIQUE 追加でエラーになる。
-- ---------------------------------------------------------------------
CREATE TEMP TABLE seikyu_zero ON COMMIT DROP AS
SELECT z.id, z.denno AS del_denno,
       (SELECT k.denno FROM trseikyu k
         WHERE k.id = z.id AND k.mcode = z.mcode AND k.sday = z.sday AND k.denno <> z.denno
         ORDER BY (coalesce(k.zenkai, 0) = 0 AND coalesce(k.nmon, 0) = 0 AND coalesce(k.tmon, 0) = 0
                   AND coalesce(k.taxmon, 0) = 0 AND coalesce(k.tax, 0) = 0 AND coalesce(k.seikyu, 0) = 0), k.denno
         LIMIT 1) AS keep_denno
  FROM trseikyu z
 WHERE coalesce(z.zenkai, 0) = 0 AND coalesce(z.nmon, 0) = 0 AND coalesce(z.tmon, 0) = 0
   AND coalesce(z.taxmon, 0) = 0 AND coalesce(z.tax, 0) = 0 AND coalesce(z.seikyu, 0) = 0
   AND EXISTS (SELECT 1 FROM trseikyu k
                WHERE k.id = z.id AND k.mcode = z.mcode AND k.sday = z.sday AND k.denno < z.denno);

UPDATE trjyuden j SET idenno = z.keep_denno FROM seikyu_zero z WHERE j.id = z.id AND j.idenno = z.del_denno;
UPDATE trnyusub n SET idenno = z.keep_denno FROM seikyu_zero z WHERE n.id = z.id AND n.idenno = z.del_denno;
DELETE FROM trseikyu s USING seikyu_zero z WHERE s.id = z.id AND s.denno = z.del_denno;

-- ---------------------------------------------------------------------
-- 2. 請求伝票（trseikyu）
--    ・主キーを (id, denno) に変更（従来は sday,id,mcode,denno,bcode）
--    ・同一顧客・同一締め日の請求伝票を DB で禁止する（UNIQUE）
--    ・税率別内訳、締め期間開始日、作成者等を追加
--    移行データは作成日時等が NULL（＝現行システムから移行した請求伝票）
-- ---------------------------------------------------------------------
ALTER TABLE trseikyu DROP CONSTRAINT trseikyu_pkey;
ALTER TABLE trseikyu ALTER COLUMN bcode DROP NOT NULL;
ALTER TABLE trseikyu ADD PRIMARY KEY (id, denno);
ALTER TABLE trseikyu ADD CONSTRAINT trseikyu_mcode_sday_key UNIQUE (id, mcode, sday);

ALTER TABLE trseikyu
    ADD COLUMN fday       date                                       -- 締め期間開始日（前回締め日の翌日）
  , ADD COLUMN kurikosi   numeric                                    -- 前回繰越額 = zenkai - nmon - tmon
  , ADD COLUMN taxmon8    numeric                                    -- 今回御買上額のうち 8% 対象（税抜）
  , ADD COLUMN tax8       numeric                                    -- 消費税 8%
  , ADD COLUMN taxmon10   numeric                                    -- 今回御買上額のうち 10% 対象（税抜）
  , ADD COLUMN tax10      numeric                                    -- 消費税 10%
  , ADD COLUMN dencnt     integer                                    -- 計上した受注伝票の件数
  , ADD COLUMN created_at timestamp(6) with time zone
  , ADD COLUMN created_by text
  , ADD COLUMN updated_at timestamp(6) with time zone
  , ADD COLUMN updated_by text;
-- 既存行は NULL のまま、新規行だけ現在日時が入るように、列の追加後に既定値を付ける
ALTER TABLE trseikyu ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE trseikyu ALTER COLUMN updated_at SET DEFAULT now();

UPDATE trseikyu SET kurikosi = coalesce(zenkai, 0) - coalesce(nmon, 0) - coalesce(tmon, 0);

COMMENT ON COLUMN trseikyu.zenkai IS '前回請求額';
COMMENT ON COLUMN trseikyu.nmon   IS '入金額（入金 - 出金）';
COMMENT ON COLUMN trseikyu.tmon   IS '調整額';
COMMENT ON COLUMN trseikyu.taxmon IS '今回御買上額（税抜）';
COMMENT ON COLUMN trseikyu.tax    IS '消費税額';
COMMENT ON COLUMN trseikyu.seikyu IS '今回請求額 = kurikosi + taxmon + tax';
COMMENT ON COLUMN trseikyu.bcode  IS '部門コード（現行システムからの移行データのみ）';

-- ---------------------------------------------------------------------
-- 3. 受注伝票（trjyuden）
--    idenno（既存列）に計上先の請求伝票番号を入れる。
--      NULL = 未請求、0 = 移行時に請求対象外、> 0 = 請求済（trseikyu.denno）
--    移行SQL（work/jyuden.sql）はすべての受注伝票に idenno = 0 を入れているので、次のように置き換える。
--      ・都度請求の伝票、売上日が未設定の伝票 → NULL
--      ・掛売で、売上日以降に締め日のある請求伝票がある → その請求伝票番号
--        （現行の締め処理は「前回締め日の翌日～締め日」の売上日で集計していたため）
--      ・掛売で、請求伝票が無く売上日が 2026-01-01 以降 → NULL（次の締めで計上）
--      ・掛売で、請求伝票が無く売上日が 2026 年より前（取引の止まった請求先）→ 0 のまま
--    移行SQLで idenno を NULL にした場合も、掛売・売上日ありの伝票は同じ規則で設定する。
-- ---------------------------------------------------------------------
UPDATE trjyuden SET idenno = NULL
 WHERE idenno = 0 AND (torikbn IS NOT TRUE OR uday IS NULL);

UPDATE trjyuden j
   SET idenno = coalesce((SELECT s.denno FROM trseikyu s
                           WHERE s.id = j.id AND s.mcode = j.scde AND s.sday >= j.uday
                           ORDER BY s.sday LIMIT 1), 0)
 WHERE j.torikbn AND j.uday IS NOT NULL AND (j.idenno = 0 OR j.idenno IS NULL);

UPDATE trjyuden SET idenno = NULL
 WHERE torikbn AND idenno = 0 AND uday >= '2026-01-01';

COMMENT ON COLUMN trjyuden.idenno IS '計上先請求伝票番号（掛売の締め処理で設定。NULL = 未請求、0 = 移行時に請求対象外）';

CREATE INDEX IF NOT EXISTS trjyuden_seikyu_idx
    ON trjyuden (id, scde, uday)
    WHERE torikbn AND idenno IS NULL;
CREATE INDEX IF NOT EXISTS trjyuden_idenno_idx
    ON trjyuden (id, idenno)
    WHERE idenno > 0;

-- 請求済（idenno > 0）の受注伝票は、請求金額に関わる項目の変更と削除を禁止する。
-- idenno 自体の変更（締め処理での設定・請求取消での解除）は許可する。
-- 画面（frmsales）でも編集・取消ボタンを出さないが、DB でも守る。
CREATE OR REPLACE FUNCTION trjyuden_lock_billed() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF coalesce(OLD.idenno, 0) > 0 THEN
      RAISE EXCEPTION '受注伝票%は請求済（請求伝票%）のため削除できません', OLD.denno, OLD.idenno;
    END IF;
    RETURN OLD;
  END IF;
  IF coalesce(OLD.idenno, 0) > 0 AND NEW.idenno IS NOT DISTINCT FROM OLD.idenno
     AND (NEW.total, NEW.taxtotal, NEW.scde, NEW.torikbn, NEW.uday, COALESCE(NEW.del, false))
         IS DISTINCT FROM
         (OLD.total, OLD.taxtotal, OLD.scde, OLD.torikbn, OLD.uday, COALESCE(OLD.del, false)) THEN
    RAISE EXCEPTION '受注伝票%は請求済（請求伝票%）のため変更できません', OLD.denno, OLD.idenno;
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trjyuden_lock_billed ON trjyuden;
CREATE TRIGGER trjyuden_lock_billed
  BEFORE UPDATE OR DELETE ON trjyuden
  FOR EACH ROW EXECUTE FUNCTION trjyuden_lock_billed();

-- ---------------------------------------------------------------------
-- 4. 入金伝票（trnyusub）
--    請求入金（kubun=1）を、どの請求伝票の「入金額」に計上したかを記録する。
--    NULL = まだどの請求にも計上していない。
--    （idenno は「どの請求に対する入金か（消込先）」で、意味が異なる）
--    移行データ: 入金日以降で最初の締め日の請求伝票に計上済とする。
-- ---------------------------------------------------------------------
ALTER TABLE trnyusub ADD COLUMN IF NOT EXISTS kdenno integer;
COMMENT ON COLUMN trnyusub.kdenno IS '計上先請求伝票番号（請求締めで入金額に計上した trseikyu.denno）';

UPDATE trnyusub n
   SET kdenno = (SELECT s.denno FROM trseikyu s
                  WHERE s.id = n.id AND s.mcode = n.mcode AND s.sday >= n.day
                  ORDER BY s.sday LIMIT 1)
 WHERE n.kubun = 1 AND n.kdenno IS NULL;

-- 2026 年より前の入金で、その後に請求伝票の無い（取引の止まった）請求先のものは、
-- 移行時点で計上対象外として kdenno = 0 にする。こうしないと次の締めで古い入金がまとめて計上される。
-- 2026 年以降の未計上の入金（最後の締め日より後の入金）は NULL のまま残し、次の締めで計上する。
UPDATE trnyusub
   SET kdenno = 0
 WHERE kubun = 1 AND kdenno IS NULL AND day < '2026-01-01';
COMMENT ON COLUMN trnyusub.kdenno IS '計上先請求伝票番号（請求締めで入金額に計上した trseikyu.denno。0 = 移行時に計上対象外とした入金）';

CREATE INDEX IF NOT EXISTS trnyusub_seikyu_idx
    ON trnyusub (id, mcode, day)
    WHERE kubun = 1 AND kdenno IS NULL;

-- ---------------------------------------------------------------------
-- 5. 請求伝票番号の採番（trnumber.type = 'idenno'）
-- ---------------------------------------------------------------------
INSERT INTO trnumber (id, type, curnum)
SELECT c.id, 'idenno', COALESCE((SELECT max(denno) FROM trseikyu s WHERE s.id = c.id), 0)
  FROM (SELECT DISTINCT id FROM trnumber) c
 WHERE NOT EXISTS (SELECT 1 FROM trnumber n WHERE n.id = c.id AND n.type = 'idenno');

-- ---------------------------------------------------------------------
-- Hasura 側の確認事項（リレーションの追加は不要。画面は idenno / kdenno で直接検索する）
--   ・trseikyu の select / insert / delete 権限に、追加した列を含める
--   ・trjyuden の select / update 権限に idenno、trnyusub の select / update 権限に kdenno を含める
--   ・主キー変更により trseikyu_by_pk 系の引数が (id, denno) に変わる
--   ・trseikyu_bak20261028 は移行の確認が済んだら削除してよい（Hasura で track する必要はない）
-- ---------------------------------------------------------------------
