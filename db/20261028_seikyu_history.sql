-- =====================================================================
-- 請求伝票の論理削除と履歴（20261028_seikyu_shime.sql の適用後に実行する）
--
--   ・trseikyu.del           : 請求取消は論理削除（行を残す）
--   ・trseikyusub            : 請求明細。請求登録時に計上した受注伝票・請求入金伝票と金額を記録し、以後変更しない
--   ・tropelog（既存の共通表）: 請求登録・請求取消の操作をトリガーで記録する（extype = '5' 掛請求伝票）
--
-- 適用方法: Hasura コンソール > Data > SQL で、STEP 1 → 2 → 3 の順に「1 つずつ」貼り付けて実行する。
--   各 STEP の先頭の search_path を test / public に合わせること。
--   STEP 1 は表の構造の変更（すぐ終わる）。STEP 3 は件数が多く、本番では 30 秒を超えることがある。
--   30 秒を超えると画面はタイムアウトするが、DB では処理が続き、終わると反映される。
--   その間も trseikyu を独占ロックしないので、アプリは使える。終わったかは STEP 3 の末尾の確認SQLで見る。
--   実行後、Hasura で trseikyusub を Track し、権限を設定する（末尾の注記参照）。
--
-- ※ test には分割前の版（同じ内容を 1 回で実行する版）を適用済み。
-- =====================================================================


-- #####################################################################
-- STEP 1: 表の構造（論理削除・請求明細の表・トリガー）
-- #####################################################################
SET search_path TO public;  -- テスト環境に適用するときは test に変更

-- 1. 請求伝票の論理削除
--    同一顧客・同一締め日の一意制約は、取消していない請求伝票だけを対象にする
--    （取消後に同じ締め日で作り直せるようにするため）
ALTER TABLE trseikyu ADD COLUMN del boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN trseikyu.del IS '取消（論理削除）。取消した日時・担当者は updated_at / updated_by';

ALTER TABLE trseikyu DROP CONSTRAINT trseikyu_mcode_sday_key;
CREATE UNIQUE INDEX trseikyu_mcode_sday_key ON trseikyu (id, mcode, sday) WHERE NOT del;

-- 2. 請求明細（trseikyusub）
--    kind = 'J'（受注伝票）/ 'N'（請求入金伝票）。金額は請求登録時点の値（返品はマイナス）。
--    請求取消後も残るので、取消した請求伝票に何を計上していたかを後から調べられる。
CREATE TABLE trseikyusub (
    id         smallint NOT NULL
  , denno      integer  NOT NULL                -- 請求伝票番号
  , line       integer  NOT NULL                -- 行番号
  , kind       text     NOT NULL CHECK (kind IN ('J', 'N'))
  , refdenno   integer  NOT NULL                -- 受注伝票番号 / 請求入金伝票番号
  , day        date                             -- 売上日 / 入金日
  , taxmon     numeric                          -- 受注: 税抜金額
  , tax        numeric                          -- 受注: 消費税
  , total      numeric                          -- 受注: 税込金額
  , nmoney     numeric                          -- 入金: 入金額
  , smoney     numeric                          -- 入金: 出金額
  , tmoney     numeric                          -- 入金: 調整額
  , memo       text
  , created_at timestamp(6) with time zone DEFAULT now()
  , created_by text
  , PRIMARY KEY (id, denno, line)
  , FOREIGN KEY (id, denno) REFERENCES trseikyu (id, denno)
);
CREATE INDEX trseikyusub_ref_idx ON trseikyusub (id, kind, refdenno);
COMMENT ON TABLE trseikyusub IS '請求明細（請求登録時に計上した受注伝票・請求入金伝票。登録後は変更しない）';

-- 3. 操作の記録（tropelog）
--    請求登録・請求取消をトリガーで記録する。extype = '5'（msbunrui kubun=extype の「掛請求伝票」）、
--    登録・取消の別は memo の先頭（「請求登録」「請求取消」）で表す。
--    keycode = 請求伝票番号、subkeycd = 請求先コード。status は使わない（frmkeep の一覧には出ない）。

-- tropelog.sequ のシーケンスを既存データの最大値に合わせる
-- （データを sequ 付きで投入した環境では、シーケンスが遅れていて主キーが重複するため）
SELECT setval(pg_get_serial_sequence('tropelog', 'sequ'), (SELECT max(sequ) FROM tropelog));

CREATE OR REPLACE FUNCTION trseikyu_opelog() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.mcode, '5',
            '請求登録 締め日=' || NEW.sday || ' 今回請求額=' || coalesce(NEW.seikyu, 0) || ' 伝票数=' || coalesce(NEW.dencnt, 0),
            NEW.created_by);
  ELSIF TG_OP = 'UPDATE' AND NEW.del AND NOT OLD.del THEN
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.mcode, '5',
            '請求取消 締め日=' || NEW.sday || ' 今回請求額=' || coalesce(NEW.seikyu, 0),
            NEW.updated_by);
  END IF;
  RETURN NULL;
END
$$ LANGUAGE plpgsql
SET search_path FROM CURRENT;  -- test の請求伝票は test.tropelog に記録する（実行時の search_path は public のため）

CREATE TRIGGER trseikyu_opelog
  AFTER INSERT OR UPDATE OF del ON trseikyu
  FOR EACH ROW EXECUTE FUNCTION trseikyu_opelog();

-- 取消済の請求伝票は元に戻さない（作り直すときは新しい番号で登録する）
CREATE OR REPLACE FUNCTION trseikyu_keep_del() RETURNS trigger AS $$
BEGIN
  IF OLD.del AND NOT NEW.del THEN
    RAISE EXCEPTION '請求伝票%は取消済のため元に戻せません', OLD.denno;
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER trseikyu_keep_del
  BEFORE UPDATE OF del ON trseikyu
  FOR EACH ROW EXECUTE FUNCTION trseikyu_keep_del();


-- #####################################################################
-- STEP 2: 統計情報の更新
--   移行SQLで受注伝票を大量に更新した直後は統計情報が古く、STEP 3 が極端に遅くなるため。
-- #####################################################################
SET search_path TO public;  -- テスト環境に適用するときは test に変更

ANALYZE trseikyu;
ANALYZE trjyuden;
ANALYZE trjyumei;
ANALYZE trnyusub;


-- #####################################################################
-- STEP 3: 既存の請求伝票（移行データ）の請求明細を、現在の紐づけ（idenno / kdenno）から作る
--   受注明細は、計上済みの受注伝票の分だけを集計する。
-- #####################################################################
SET search_path TO public;  -- テスト環境に適用するときは test に変更

-- 受注伝票（kind = 'J'）
INSERT INTO trseikyusub (id, denno, line, kind, refdenno, day, taxmon, tax, total, created_at, created_by)
WITH jj AS (
  SELECT j.id, j.idenno AS denno, j.denno AS refdenno, j.uday AS day,
         CASE WHEN j.jdstatus = '2' THEN -1 ELSE 1 END AS sign
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

-- 請求入金伝票（kind = 'N'）。行番号は受注伝票の続きから振る
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

-- 確認SQL（STEP 3 が終わったかの確認。STEP 3 とは別に実行する。件数が出れば完了）
--   SET search_path TO public;
--   SELECT kind, count(*) FROM trseikyusub GROUP BY kind;


-- ---------------------------------------------------------------------
-- Hasura 側の設定
--   ・trseikyusub を Track し、staff 等に select / insert 権限（update / delete は不要）
--   ・trseikyu の select 権限に del、update 権限に del / updated_at / updated_by を含める
--   ・trseikyu の delete 権限は不要（付けていた場合は外してよい）
--   ・tropelog への記録はトリガーで行うので、tropelog の insert 権限は不要
-- ---------------------------------------------------------------------
