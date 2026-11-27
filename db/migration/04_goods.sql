\encoding UTF8
-- =====================================================================
-- データ移行 4: 商品マスタ（msgoods・msgtanka・msgzai）の差分更新（会社ごと。洗い替えはしない）
--
-- 実行例: psql -X -v schema=test -v comp=1 -f 04_goods.sql
--   まず確認だけ（更新しない）: -v dry=1 を付ける（件数と変わる列を表示して ROLLBACK）
--
-- 前提: 01_before_load → load.ps1（msgoods.csv → mig_msgoods、msgtanka.csv → mig_msgtanka、msgzai.csv → mig_msgzai）
--       CSV のヘッダは新システムの列名（oracle/gtanka_1.sql・gzai_1.sql のように別名を付ける）。
--       load.ps1 がヘッダの列名を mig_cols に書く。ここでは CSV にあった列だけを扱う。
--
-- 行うこと（1 つのトランザクション。何度実行してもよい）
--   表ごとに、主キー（id・商品コードなど。表の主キーをそのまま使う）で突き合わせて
--   ・新システムにあり、CSV の列の値が 1 つでも違う → CSV の列だけ上書き（CSV に無い列＝新システムだけの列は残す）
--   ・新システムに無い → 追加（CSV に無い列は既定値）
--   ・新システムにあって CSV に無い → 何もしない（件数と一覧だけ表示）
--   msgzai（構成品）だけは、CSV にある商品について、CSV に無くなった構成品の行を消す（構成は 1 商品分まとめて現行に合わせる）
--   updated_at / updated_by が CSV に無ければ、上書き・追加した行に now() / 'migration' を入れる
--
-- 商品の履歴（20261121_goods_history.sql）などのトリガーは止めて行う（移行の上書きを履歴に残さない）
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
\if :{?dry}
\else
  \set dry 0
\endif
\timing on

BEGIN;
SET LOCAL search_path TO :"schema";
SELECT set_config('mig.comp', :'comp', true) AS "会社ID";

CREATE TEMP TABLE mig_goods_result (tbl text, item text, n bigint, cols text) ON COMMIT DROP;
CREATE TEMP TABLE mig_goods_diff (tbl text, keyval text, col text, old_val text, new_val text) ON COMMIT DROP;

DO $$
DECLARE
  comp   smallint := current_setting('mig.comp')::smallint;
  t      text;
  keys   text[];
  cols   text[];
  setcols text[];
  joinc  text;
  diffc  text;
  n      bigint;
  c      text;
  e      text;
  has_upd_at boolean;
  has_upd_by boolean;
BEGIN
  FOREACH t IN ARRAY ARRAY['msgoods', 'msgtanka', 'msgzai'] LOOP
    -- CSV にあった列（mig_cols）のうち、本来の表にある列
    SELECT array_agg(m.col ORDER BY m.ord) INTO cols
      FROM mig_cols m
     WHERE m.tbl = t
       AND EXISTS (SELECT 1 FROM information_schema.columns k
                    WHERE k.table_schema = current_schema() AND k.table_name = t AND k.column_name = m.col);
    IF cols IS NULL THEN
      INSERT INTO mig_goods_result VALUES (t, 'CSV なし（何もしない）', 0, NULL);
      CONTINUE;
    END IF;

    -- 主キーの列
    SELECT array_agg(a.attname ORDER BY array_position(i.indkey, a.attnum)) INTO keys
      FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
     WHERE i.indrelid = to_regclass(t) AND i.indisprimary;
    IF keys IS NULL OR NOT keys <@ cols THEN
      RAISE EXCEPTION '%: 主キー % が CSV の列 % にそろっていません', t, keys, cols;
    END IF;

    setcols := ARRAY(SELECT x FROM unnest(cols) x WHERE x <> ALL (keys));
    has_upd_at := EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = t AND column_name = 'updated_at') AND NOT ('updated_at' = ANY (cols));
    has_upd_by := EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = t AND column_name = 'updated_by') AND NOT ('updated_by' = ANY (cols));
    -- 比べない列（更新日時など）
    setcols := ARRAY(SELECT x FROM unnest(setcols) x WHERE x NOT IN ('created_at', 'updated_at', 'created_by', 'updated_by'));
    -- 追加のときだけ入れる列（商品グループ: 既存の商品のグループは新システムで決めたものを残す）
    IF t = 'msgoods' THEN
      setcols := ARRAY(SELECT x FROM unnest(setcols) x WHERE x <> 'code');
    END IF;

    -- CSV の中でキーが重なっていないか（大文字・空白を取ったことで重なることがある）
    EXECUTE format('SELECT string_agg(k, '', '') FROM (SELECT concat_ws(''/'', %s) AS k FROM mig_%s GROUP BY %s HAVING count(*) > 1 LIMIT 20) x',
      (SELECT string_agg(format('%I', k), ', ') FROM unnest(keys) k), t,
      (SELECT string_agg(format('%I', k), ', ') FROM unnest(keys) k)) INTO c;
    IF c IS NOT NULL THEN
      RAISE EXCEPTION '%: CSV の中でキーが重なっています: %', t, c;
    END IF;

    joinc := (SELECT string_agg(format('d.%1$I = s.%1$I', k), ' AND ') FROM unnest(keys) k);
    -- 上書きする値。msgoods.tkbn（中止区分）は、現行が中止（9）なら 9、現行が通常（0）で新システムが 9 なら 0、
    -- それ以外（新システムで 1 発注専用・2 在庫管理用にしたもの）は新システムの値のまま
    CREATE TEMP TABLE IF NOT EXISTS mig_setexpr (col text, expr text);
    TRUNCATE mig_setexpr;
    INSERT INTO mig_setexpr SELECT x, format('s.%I', x) FROM unnest(setcols) x;
    IF t = 'msgoods' THEN
      UPDATE mig_setexpr SET expr = 'CASE WHEN s.tkbn = ''9'' THEN ''9'' WHEN d.tkbn = ''9'' THEN s.tkbn ELSE d.tkbn END' WHERE col = 'tkbn';
    END IF;
    diffc := (SELECT string_agg(format('d.%I IS DISTINCT FROM (%s)', col, expr), ' OR ') FROM mig_setexpr);

    EXECUTE format('ALTER TABLE %I DISABLE TRIGGER USER', t);

    -- 変わる列の一覧（確認用。最大 2000 行）
    FOR c, e IN SELECT col, expr FROM mig_setexpr LOOP
      EXECUTE format(
        'INSERT INTO mig_goods_diff SELECT %L, concat_ws(''/'', %s), %L, d.%I::text, (%s)::text
           FROM %I d JOIN mig_%s s ON %s
          WHERE d.id = $1 AND d.%I IS DISTINCT FROM (%s)
          LIMIT 2000',
        t, (SELECT string_agg(format('d.%I', k), ', ') FROM unnest(keys) k), c, c, e, t, t, joinc, c, e) USING comp;
    END LOOP;

    -- 上書き（CSV の列だけ）
    IF array_length(setcols, 1) > 0 THEN
      EXECUTE format('UPDATE %I d SET %s%s%s FROM mig_%s s WHERE d.id = $1 AND %s AND (%s)',
        t,
        (SELECT string_agg(format('%I = %s', col, expr), ', ') FROM mig_setexpr),
        CASE WHEN has_upd_at THEN ', updated_at = now()' ELSE '' END,
        CASE WHEN has_upd_by THEN ', updated_by = ''migration''' ELSE '' END,
        t, joinc, diffc) USING comp;
      GET DIAGNOSTICS n = ROW_COUNT;
    ELSE
      n := 0;
    END IF;
    INSERT INTO mig_goods_result VALUES (t, '上書き（値の違う行）', n, array_to_string(setcols, ','));

    -- 追加
    EXECUTE format('INSERT INTO %I (%s%s%s) SELECT %s%s%s FROM mig_%s s WHERE s.id = $1 AND NOT EXISTS (SELECT 1 FROM %I d WHERE %s)',
      t,
      (SELECT string_agg(format('%I', x), ', ') FROM unnest(cols) x),
      CASE WHEN has_upd_at THEN ', updated_at' ELSE '' END,
      CASE WHEN has_upd_by THEN ', updated_by' ELSE '' END,
      (SELECT string_agg(format('s.%I', x), ', ') FROM unnest(cols) x),
      CASE WHEN has_upd_at THEN ', now()' ELSE '' END,
      CASE WHEN has_upd_by THEN ', ''migration''' ELSE '' END,
      t, t, joinc) USING comp;
    GET DIAGNOSTICS n = ROW_COUNT;
    INSERT INTO mig_goods_result VALUES (t, '追加（新システムに無い行）', n, NULL);

    -- 構成品: CSV にある商品の、CSV に無くなった構成品の行を消す
    IF t = 'msgzai' THEN
      EXECUTE format('DELETE FROM msgzai d WHERE d.id = $1
                         AND EXISTS (SELECT 1 FROM mig_msgzai s WHERE s.id = d.id AND s.gcode = d.gcode)
                         AND NOT EXISTS (SELECT 1 FROM mig_msgzai s WHERE %s)', joinc) USING comp;
      GET DIAGNOSTICS n = ROW_COUNT;
      INSERT INTO mig_goods_result VALUES (t, '消した構成品（現行で外された）', n, NULL);
    END IF;

    -- 新システムにだけある行（何もしない）
    EXECUTE format('SELECT count(*) FROM %I d WHERE d.id = $1 AND NOT EXISTS (SELECT 1 FROM mig_%s s WHERE %s)', t, t, joinc)
      INTO n USING comp;
    INSERT INTO mig_goods_result VALUES (t, '新システムにだけある行（そのまま）', n, NULL);

    EXECUTE format('ALTER TABLE %I ENABLE TRIGGER USER', t);
    EXECUTE format('ANALYZE %I', t);
  END LOOP;
END
$$;

SELECT tbl AS 表, item AS 項目, n AS 件数, cols AS "比べた列" FROM mig_goods_result ORDER BY tbl, item;

-- 列ごとの変わる件数
SELECT tbl AS 表, col AS 列, count(*) AS 件数 FROM mig_goods_diff GROUP BY tbl, col ORDER BY tbl, count(*) DESC;
-- 変わる値の例（表・列ごとに 5 件）
SELECT tbl AS 表, col AS 列, keyval AS キー, old_val AS 新システムの値, new_val AS 現行の値
  FROM (SELECT d.*, row_number() OVER (PARTITION BY tbl, col ORDER BY keyval) AS rn FROM mig_goods_diff d) x
 WHERE rn <= 5 ORDER BY tbl, col, keyval;

-- 通貨の確認（決算資料の赤字の原因: 円の原価なのに USD。リハーサル後の確認項目）
SELECT gcode, day, cost, genka, currency FROM msgtanka
 WHERE id = :comp AND currency = 'USD' AND (cost >= 1000 OR genka >= 1000) ORDER BY gcode, day;

\if :dry
  \echo '*** dry=1: ROLLBACK しました（何も変わっていません） ***'
  ROLLBACK;
\else
  COMMIT;
\endif
