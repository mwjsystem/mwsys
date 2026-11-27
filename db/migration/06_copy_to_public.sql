\encoding UTF8
-- =====================================================================
-- データ移行 6: test に入れて確認した会社のデータを、public に同じように入れる（同じ DB の別スキーマなので SQL だけで写す）
--
-- 実行例: psql -X -v comp=1 -f 06_copy_to_public.sql
--   写す元・先を変えるとき: -v src=test -v dst=public（既定）
--
-- 前提: test で 00〜05 を流し、画面で確認が済んでいること。public の画面を使っている人がいないこと。
--
-- 写し方（id = comp の行だけ。他の会社の行には触らない。1 つのトランザクション）
--   入れ替え … public の行を消して test の行を入れる: 伝票・在庫・棚卸・請求・入金・仕入先・顧客（msmember・msmadr）
--   上書き   … 主キーで突き合わせて test の値で上書き・無ければ追加（public にだけある行は残す）: 商品（msgoods・msgtanka・msgzai）
--             ただし商品グループ（msgoods.code）は、test が仮グループ 00TMP なら public のグループを残す（public で付け直したグループを戻さない）
--             msgzai は test にある商品の、test に無い構成品の行を消す
--   採番（trnumber）… test の番号に合わせる（public の方が大きければそのまま）
--   新システムだけの伝票（テスト期間の入力: 出荷キープ・未収・加工指示・棚卸入力・仕入チェック・受注履歴）は public でも消す
-- 列は両方のスキーマにある列だけ（並びが違っても列名で当てる）。USER トリガーは止める。
-- =====================================================================
\set ON_ERROR_STOP on
\if :{?comp}
\else
  \echo '-v comp=<会社ID> を指定してください（マーシャル 1 / 東海堂 2）'
  \quit
\endif
\if :{?src}
\else
  \set src test
\endif
\if :{?dst}
\else
  \set dst public
\endif
\timing on

BEGIN;
SELECT set_config('mig.comp', :'comp', true) AS "会社ID", set_config('mig.src', :'src', true) AS 元, set_config('mig.dst', :'dst', true) AS 先;

CREATE TEMP TABLE mig_copy (seq int, tbl text, mode text) ON COMMIT DROP;
-- seq の小さい順に消し、大きい順に入れる（明細 → 伝票 → マスタ）
INSERT INTO mig_copy VALUES
  ( 1, 'trseikyusub', 'replace'), ( 2, 'trseikyu', 'replace'), ( 3, 'trnyusub', 'replace'), ( 4, 'trnyuden', 'replace'),
  ( 5, 'trmisyu', 'clear'), ( 6, 'trkeep', 'clear'), ( 7, 'tjyuhist', 'clear'),
  ( 8, 'trkakoposi', 'clear'), ( 9, 'trkakomei', 'clear'), (10, 'trkako', 'clear'),
  (11, 'trjyumzai', 'replace'), (12, 'trjyumei', 'replace'), (13, 'trjyuden', 'replace'),
  (14, 'trsiichk', 'clear'), (15, 'trsiimei', 'replace'), (16, 'trsiiden', 'replace'),
  (17, 'trhatmei', 'replace'), (18, 'trhatden', 'replace'),
  (19, 'trmovden', 'replace'), (20, 'trmovsub', 'replace'), (21, 'trtenden', 'replace'), (22, 'trchoden', 'replace'), (23, 'trhgnden', 'replace'),
  (24, 'trtanaent', 'clear'), (25, 'trgtana', 'replace'), (26, 'trzaiko', 'replace'),
  (27, 'msvendor', 'replace'),
  (28, 'msmadr', 'replace'), (29, 'msmember', 'replace'),
  (30, 'msgzai', 'upsert'), (31, 'msgtanka', 'upsert'), (32, 'msgoods', 'upsert');

CREATE TEMP TABLE mig_copy_result (seq int, tbl text, item text, n bigint) ON COMMIT DROP;

DO $$
DECLARE
  comp smallint := current_setting('mig.comp')::smallint;
  src  text := current_setting('mig.src');
  dst  text := current_setting('mig.dst');
  r record;
  cols text;
  scols text;
  keys text[];
  joinc text;
  setc text;
  n bigint;
BEGIN
  IF src = dst THEN
    RAISE EXCEPTION '元と先が同じです（%）', src;
  END IF;

  -- 対象の表（両方のスキーマにあり、id 列があるもの）
  CREATE TEMP TABLE mig_copy_t ON COMMIT DROP AS
  SELECT c.* FROM mig_copy c
   WHERE to_regclass(format('%I.%I', dst, c.tbl)) IS NOT NULL
     AND (c.mode = 'clear' OR to_regclass(format('%I.%I', src, c.tbl)) IS NOT NULL)
     AND EXISTS (SELECT 1 FROM information_schema.columns k WHERE k.table_schema = dst AND k.table_name = c.tbl AND k.column_name = 'id');

  FOR r IN SELECT * FROM mig_copy_t LOOP
    EXECUTE format('ALTER TABLE %I.%I DISABLE TRIGGER USER', dst, r.tbl);
  END LOOP;

  -- 消す（明細から）
  FOR r IN SELECT * FROM mig_copy_t WHERE mode IN ('replace', 'clear') ORDER BY seq LOOP
    EXECUTE format('DELETE FROM %I.%I WHERE id = $1', dst, r.tbl) USING comp;
    GET DIAGNOSTICS n = ROW_COUNT;
    INSERT INTO mig_copy_result VALUES (r.seq, r.tbl, '消した', n);
  END LOOP;

  -- 入れる（マスタから）
  FOR r IN SELECT * FROM mig_copy_t WHERE mode IN ('replace', 'upsert') ORDER BY seq DESC LOOP
    SELECT string_agg(format('%I', d.column_name), ', ' ORDER BY d.ordinal_position),
           string_agg(format('s.%I', d.column_name), ', ' ORDER BY d.ordinal_position)
      INTO cols, scols
      FROM information_schema.columns d
     WHERE d.table_schema = dst AND d.table_name = r.tbl
       AND d.is_generated = 'NEVER' AND d.identity_generation IS NULL
       AND EXISTS (SELECT 1 FROM information_schema.columns s WHERE s.table_schema = src AND s.table_name = r.tbl AND s.column_name = d.column_name);

    IF r.mode = 'replace' THEN
      EXECUTE format('INSERT INTO %I.%I (%s) SELECT %s FROM %I.%I s WHERE s.id = $1', dst, r.tbl, cols, scols, src, r.tbl) USING comp;
      GET DIAGNOSTICS n = ROW_COUNT;
      INSERT INTO mig_copy_result VALUES (r.seq, r.tbl, '入れた', n);
    ELSE
      SELECT array_agg(a.attname ORDER BY array_position(i.indkey, a.attnum)) INTO keys
        FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
       WHERE i.indrelid = to_regclass(format('%I.%I', dst, r.tbl)) AND i.indisprimary;
      IF keys IS NULL THEN
        RAISE EXCEPTION '%.%: 主キーがありません', dst, r.tbl;
      END IF;
      -- msgoods.code（商品グループ）: test が仮グループ 00TMP のときは、先（public）で付け直したグループを残す
      SELECT string_agg(CASE WHEN r.tbl = 'msgoods' AND d.column_name = 'code'
                             THEN 'code = CASE WHEN trim(EXCLUDED.code) = ''00TMP'' THEN d.code ELSE EXCLUDED.code END'
                             ELSE format('%1$I = EXCLUDED.%1$I', d.column_name) END, ', ')
        INTO setc
        FROM information_schema.columns d
       WHERE d.table_schema = dst AND d.table_name = r.tbl AND d.column_name <> ALL (keys)
         AND EXISTS (SELECT 1 FROM information_schema.columns s WHERE s.table_schema = src AND s.table_name = r.tbl AND s.column_name = d.column_name);
      EXECUTE format('INSERT INTO %I.%I AS d (%s) SELECT %s FROM %I.%I s WHERE s.id = $1 ON CONFLICT (%s) DO UPDATE SET %s',
        dst, r.tbl, cols, scols, src, r.tbl, (SELECT string_agg(format('%I', k), ', ') FROM unnest(keys) k), setc) USING comp;
      GET DIAGNOSTICS n = ROW_COUNT;
      INSERT INTO mig_copy_result VALUES (r.seq, r.tbl, '上書き・追加した', n);

      IF r.tbl = 'msgzai' THEN
        joinc := (SELECT string_agg(format('s.%1$I = d.%1$I', k), ' AND ') FROM unnest(keys) k);
        EXECUTE format('DELETE FROM %I.msgzai d WHERE d.id = $1
                          AND EXISTS (SELECT 1 FROM %I.msgzai s WHERE s.id = d.id AND s.gcode = d.gcode)
                          AND NOT EXISTS (SELECT 1 FROM %I.msgzai s WHERE %s)', dst, src, src, joinc) USING comp;
        GET DIAGNOSTICS n = ROW_COUNT;
        INSERT INTO mig_copy_result VALUES (r.seq, r.tbl, '消した構成品', n);
      END IF;
    END IF;
  END LOOP;

  FOR r IN SELECT * FROM mig_copy_t LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE TRIGGER USER', dst, r.tbl);
    EXECUTE format('ANALYZE %I.%I', dst, r.tbl);
  END LOOP;

  -- 採番: test の番号に合わせる（public の方が大きければそのまま）
  EXECUTE format('INSERT INTO %1$I.trnumber (id, type, curnum)
                  SELECT s.id, s.type, s.curnum FROM %2$I.trnumber s WHERE s.id = $1
                  ON CONFLICT (id, type) DO UPDATE SET curnum = greatest(%1$I.trnumber.curnum, EXCLUDED.curnum)', dst, src) USING comp;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO mig_copy_result VALUES (99, 'trnumber', '合わせた種別', n);

  -- 操作ログのシーケンス
  EXECUTE format('SELECT setval(pg_get_serial_sequence(%L, ''sequ''), (SELECT max(sequ) FROM %I.tropelog))', dst || '.tropelog', dst);
END
$$;

SELECT tbl AS 表, item AS 処理, n AS 件数 FROM mig_copy_result ORDER BY seq, item;

-- 件数の突き合わせ（id = comp の行。商品は public にだけある行があると多くなる）
SELECT c.tbl AS 表,
       (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM %I.%I WHERE id = %s', :'src', c.tbl, :'comp'), false, true, '')))[1]::text AS 元,
       (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM %I.%I WHERE id = %s', :'dst', c.tbl, :'comp'), false, true, '')))[1]::text AS 先
  FROM mig_copy c
 WHERE c.mode <> 'clear'
   AND to_regclass(:'src' || '.' || c.tbl) IS NOT NULL AND to_regclass(:'dst' || '.' || c.tbl) IS NOT NULL
 ORDER BY c.seq;

COMMIT;
