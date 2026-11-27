\encoding UTF8
-- =====================================================================
-- 現行システムからのデータ移行: CSV 投入（\copy）の前に実行する
--
-- 実行例（Windows の psql。<...> は環境に合わせる。test に投入するときは -v schema=test を付ける）:
--   psql -h <host> -U <user> -d <db> -v schema=public -f 01_before_load.sql
--
-- 2026-11-27: 会社ごとの移行（マーシャル → 東海堂）にした。先に 00_clear.sql、CSV の投入は load.ps1 で行う。
--             顧客・商品マスタの CSV を受ける表（mig_*）を作るようにした（手順は README_rehearsal.md）
--
-- 行うこと
--   1. 請求伝票の CSV（seikyu.sql の抽出結果）を受ける一時的な表 trseikyu_load を作り、空にする
--      （現行の請求伝票は部門別に複数行あり、trseikyu の主キー (id, denno) に直接は入らないため）
--   2. trnyusub に投入するための \copy コマンド（列名つき）を表示する
--      （trnyusub には kdenno を追加したので、列名なしの \copy では列数が合わない）
--
-- この後の手順
--   ・各表の TRUNCATE と \copy を、これまでどおり行う。ただし次の 2 つは変える
--       trseikyu : \copy trseikyu_load FROM '...\trseikyu.csv' with csv header;
--       trnyusub : 下に表示される「列名つき」の \copy を使う
--       trjyuden : 同じく下に表示される「列名つき」の \copy を使う（出荷・伝票区分の列を追加したため）
--   ・投入が終わったら 02_after_load.sql を実行する
-- =====================================================================
\if :{?schema}
\else
  \set schema public
\endif
SET search_path TO :"schema";

-- 1. 請求伝票の CSV を受ける表（列の並びは seikyu.sql の抽出結果と同じ。主キーなし）
CREATE TABLE IF NOT EXISTS trseikyu_load (
    id      smallint
  , mcode   text
  , denno   integer
  , sday    date
  , zenkai  numeric
  , nmon    numeric
  , tmon    numeric
  , taxmon  numeric
  , tax     numeric
  , seikyu  numeric
  , bcode   text
);
COMMENT ON TABLE trseikyu_load IS 'データ移行用: 現行システムの請求伝票 CSV を受ける表（02_after_load.sql で trseikyu へ移す）';
TRUNCATE trseikyu_load;

-- 1a. 顧客・商品マスタの CSV を受ける表（03_member.sql・04_goods.sql で本来の表へ移す）
--     顧客: 列の並びは oracle/member_1.sql と同じ
CREATE TABLE IF NOT EXISTS mig_msmember (
    id smallint, mcode text, sei text, kana text, tankakbn text, mtax text, pcode text,
    daibunrui text, chubunrui text, tcode1 text, del boolean, dmemo text, memo text, torikbn boolean,
    sime smallint, site text, inday smallint, scde text, sscode text,
    mail text, mail2 text, mail3 text, mail4 text, seikyuu smallint
);
COMMENT ON TABLE mig_msmember IS 'データ移行用: 現行の顧客マスタ CSV（03_member.sql で msmember へ洗い替え）';
TRUNCATE mig_msmember;

--     住所・商品・単価・構成品: 本来の表と同じ列（NOT NULL は外す。CSV に無い列は NULL のまま）
DROP TABLE IF EXISTS mig_msmadr, mig_msgoods, mig_msgtanka, mig_msgzai;
CREATE TABLE mig_msmadr   (LIKE msmadr);
CREATE TABLE mig_msgoods  (LIKE msgoods);
CREATE TABLE mig_msgtanka (LIKE msgtanka);
CREATE TABLE mig_msgzai   (LIKE msgzai);
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT table_name, column_name FROM information_schema.columns
            WHERE table_schema = current_schema() AND is_nullable = 'NO'
              AND table_name IN ('mig_msmadr', 'mig_msgoods', 'mig_msgtanka', 'mig_msgzai') LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP NOT NULL', r.table_name, r.column_name);
  END LOOP;
END
$$;

--     CSV に入っていた列（load.ps1 が書く。04_goods.sql はこの列だけを差分更新する）
CREATE TABLE IF NOT EXISTS mig_cols (tbl text, col text, ord int);
TRUNCATE mig_cols;

-- 1b. 受注伝票の操作の記録（trjyuden_opelog）を止める。移行データの登録を操作ログに残さないため。
--     02_after_load.sql の最後で戻す（02 を実行しないと止まったままになるので注意）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = to_regclass('trjyuden') AND tgname = 'trjyuden_opelog') THEN
    ALTER TABLE trjyuden DISABLE TRIGGER trjyuden_opelog;
  END IF;
END
$$;

-- 2. trnyusub の \copy コマンド（kdenno を除く列名つき）
SELECT '\copy ' || :'schema' || '.trnyusub ('
       || string_agg(column_name, ', ' ORDER BY ordinal_position)
       || ') FROM ''<CSVのパス>\trnyusub.csv'' with csv header;' AS "trnyusub の \copy コマンド"
  FROM information_schema.columns
 WHERE table_schema = :'schema' AND table_name = 'trnyusub' AND column_name <> 'kdenno';

-- 3. trjyuden の \copy コマンド（新システムで追加した出荷・伝票区分の列を除く列名つき。
--    移行用の jyuden.sql は jdstatus に現行の denku を出すので、02_after_load.sql で denku に移す）
SELECT '\copy ' || :'schema' || '.trjyuden ('
       || string_agg(column_name, ', ' ORDER BY ordinal_position)
       || ') FROM ''<CSVのパス>\trjyuden.csv'' with csv header;' AS "trjyuden の \copy コマンド"
  FROM information_schema.columns
 WHERE table_schema = :'schema' AND table_name = 'trjyuden'
   AND column_name NOT IN ('denku', 'shipdir', 'ship_at', 'ship_by', 'print_at', 'print_by', 'pick_at', 'pick_by',
                           'keep_at', 'keep_by', 'kpchk_at', 'kpchk_by');
