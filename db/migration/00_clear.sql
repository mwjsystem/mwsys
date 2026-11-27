\encoding UTF8
-- =====================================================================
-- データ移行 0: 投入する会社の伝票を消す（会社ごと。他の会社の行には触らない）
--
-- 実行例（Windows の psql。接続先は環境変数 PGHOST / PGUSER / PGDATABASE など）:
--   psql -X -v schema=test -v comp=1 -f 00_clear.sql
--
--   comp  : 新システムの会社 ID（マーシャル 1 / 東海堂 2）。必ず指定する
--   schema: public（本番）/ test
--
-- 以前の手順（psql.xlsm）は TRUNCATE だったが、マーシャル本稼働後に東海堂を移行するときに
-- マーシャルの伝票まで消えるので、id で消すようにした。
--
-- 消すもの（id = comp の行）
--   ・現行から入れ直す伝票: 受注・発注・仕入・移動・展開・在庫調整・発注外入荷・在庫・棚卸・請求・入金
--   ・仕入先マスタ（現行から入れ直す）
--   ・新システムだけの伝票（テスト期間の入力）: 出荷キープ・未収・加工指示・棚卸入力・仕入チェック・受注履歴
-- 消さないもの
--   ・商品マスタ（msgoods / msgtanka / msgzai）: 04_goods.sql で差分更新
--   ・顧客マスタ（msmember / msmadr）         : 03_member.sql で洗い替え（その中で消す）
--   ・システム的なマスタ（分類・担当者・倉庫・帳票など）
--
-- 全体を 1 つのトランザクションで行う。途中でエラーになったら何も変わらない。
-- 消す間は、操作の記録（tropelog）・更新日時のトリガー（USER トリガー）を止める。外部キーは止めない。
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
\timing on

BEGIN;
SET LOCAL search_path TO :"schema";
SELECT set_config('mig.comp', :'comp', true) AS "会社ID";

CREATE TEMP TABLE mig_clear (seq int, tbl text) ON COMMIT DROP;
-- 明細 → 伝票の順（外部キーがあっても消せる順）
INSERT INTO mig_clear VALUES
  ( 1, 'trseikyusub'), ( 2, 'trseikyu'), ( 3, 'trnyusub'), ( 4, 'trnyuden'),
  ( 5, 'trmisyu'), ( 6, 'trkeep'), ( 7, 'tjyuhist'),
  ( 8, 'trkakoposi'), ( 9, 'trkakomei'), (10, 'trkako'),
  (11, 'trjyumzai'), (12, 'trjyumei'), (13, 'trjyuden'),
  (14, 'trsiichk'), (15, 'trsiimei'), (16, 'trsiiden'),
  (17, 'trhatmei'), (18, 'trhatden'),
  (19, 'trmovden'), (20, 'trmovsub'), (21, 'trtenden'), (22, 'trchoden'), (23, 'trhgnden'),
  (24, 'trtanaent'), (25, 'trgtana'), (26, 'trzaiko'),
  (27, 'msvendor');

DO $$
DECLARE
  r record;
  n bigint;
  comp smallint := current_setting('mig.comp')::smallint;
BEGIN
  FOR r IN SELECT c.tbl FROM mig_clear c
            WHERE to_regclass(c.tbl) IS NOT NULL
              AND EXISTS (SELECT 1 FROM information_schema.columns k
                           WHERE k.table_schema = current_schema() AND k.table_name = c.tbl AND k.column_name = 'id')
            ORDER BY c.seq LOOP
    EXECUTE format('ALTER TABLE %I DISABLE TRIGGER USER', r.tbl);
    EXECUTE format('DELETE FROM %I WHERE id = $1', r.tbl) USING comp;
    GET DIAGNOSTICS n = ROW_COUNT;
    EXECUTE format('ALTER TABLE %I ENABLE TRIGGER USER', r.tbl);
    RAISE NOTICE '% : % 行を消した', rpad(r.tbl, 12), n;
  END LOOP;
  -- 受注明細を消したので、原価の円換算（02_after_load.sql）をやり直せるようにする
  IF to_regclass('mig_genka_done') IS NOT NULL THEN
    DELETE FROM mig_genka_done WHERE id = comp;
  END IF;
END
$$;

-- 結果（消した後に残っている行。comp の行は 0 のはず）
SELECT c.tbl AS 表,
       (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM %I WHERE id = %s', c.tbl, :'comp'), false, true, '')))[1]::text AS "comp の残り",
       (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM %I WHERE id <> %s', c.tbl, :'comp'), false, true, '')))[1]::text AS "他の会社"
  FROM mig_clear c
 WHERE to_regclass(c.tbl) IS NOT NULL
   AND EXISTS (SELECT 1 FROM information_schema.columns k
                WHERE k.table_schema = :'schema' AND k.table_name = c.tbl AND k.column_name = 'id')
 ORDER BY c.seq;

COMMIT;
