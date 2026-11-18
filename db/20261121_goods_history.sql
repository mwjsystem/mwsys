-- =====================================================================
-- 商品マスタの履歴（操作ログ）とカタログ頁
--
--   ・msggroup / msgoods / msgtanka / msgsptnk / msgzai の追加・変更・削除を、トリガーで tropelog に記録する
--     （extype = '14' 商品マスタ。keycode = 商品グループコード、subkeycd = 商品コード）。
--     変更は「変わった列だけ」を 旧→新 で残す。画面・価格改定取込・MST-GOODS.xlsm のどこから直しても記録される。
--   ・msggroup.catpage: カタログの頁（掛率表の並び順に使う。価格改定取込で全情報リストの「頁」を入れる）
--
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する。
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

-- ---------------------------------------------------------------------
-- 1. カタログの頁
-- ---------------------------------------------------------------------
ALTER TABLE msggroup ADD COLUMN IF NOT EXISTS catpage integer;
COMMENT ON COLUMN msggroup.catpage IS 'カタログの頁（掛率表の並び順）';

-- ---------------------------------------------------------------------
-- 2. 列の名前（操作ログに出す名前。単価は mssystem の tnk1txt ～ tnk9txt）
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION msgoods_label(p_id smallint, p_col text) RETURNS text AS $$
DECLARE
  v text;
BEGIN
  IF p_col ~ '^tanka[1-9]$' THEN
    BEGIN
      EXECUTE format('SELECT %I FROM mssystem WHERE id = $1', 'tnk' || substr(p_col, 6) || 'txt') INTO v USING p_id;
    EXCEPTION WHEN others THEN
      v := NULL;
    END;
    RETURN coalesce(nullif(v, ''), p_col);
  END IF;
  RETURN CASE p_col
    WHEN 'kana' THEN 'フリガナ' WHEN 'name' THEN 'グループ名' WHEN 'gkbn' THEN '商品区分' WHEN 'memo' THEN '備考'
    WHEN 'sozai' THEN '素材' WHEN 'vcode' THEN '仕入先' WHEN 'tcode' THEN '管理担当者' WHEN 'specurl' THEN '仕様書URL'
    WHEN 'genre' THEN 'ジャンル' WHEN 'catalog' THEN 'カタログコメント' WHEN 'category' THEN 'カテゴリ' WHEN 'subcat' THEN 'サブカテゴリ'
    WHEN 'catpage' THEN 'カタログ頁' WHEN 'code' THEN 'グループコード'
    WHEN 'size' THEN 'サイズ' WHEN 'color' THEN '色' WHEN 'gskbn' THEN '数量区分' WHEN 'jan' THEN 'JAN' WHEN 'weight' THEN '重量'
    WHEN 'unit' THEN '販売単位' WHEN 'tkbn' THEN '中止区分' WHEN 'zkbn' THEN '在庫区分' WHEN 'gtext' THEN '商品名称'
    WHEN 'max' THEN '1個口可能数' WHEN 'send' THEN '送料区分' WHEN 'ordering' THEN '受発注品' WHEN 'koguchi' THEN '個口数'
    WHEN 'lot' THEN '発注ロット' WHEN 'vgcode' THEN '海外発注品番' WHEN 'hgcode' THEN '加工前品番' WHEN 'tanano' THEN '棚番号'
    WHEN 'cost' THEN '営業原価' WHEN 'genka' THEN '仕入原価' WHEN 'taxrate' THEN '消費税率' WHEN 'currency' THEN '通貨'
    WHEN 'sptanka' THEN '特別単価' WHEN 'sptnkbn' THEN '特別単価区分' WHEN 'day' THEN '有効開始日'
    WHEN 'zcode' THEN '構成品' WHEN 'irisu' THEN '入数'
    ELSE p_col END;
END
$$ LANGUAGE plpgsql STABLE
SET search_path FROM CURRENT;

-- ---------------------------------------------------------------------
-- 3. 記録するトリガー（5 つの表で共通）
--    記録者: 行の updated_by / created_by → 同じトランザクションで更新した商品グループの updated_by
--            （単価・商品の表には記録者の列が無いため。画面の保存・価格改定取込はグループも更新する）→ Hasura のユーザー
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION msgoods_opelog() RETURNS trigger AS $$
DECLARE
  r jsonb;
  o jsonb;
  k text;
  parts text[] := '{}';
  v_id smallint;
  v_code text;
  v_gcode text;
  v_what text;
  v_memo text;
  v_by text;
  v_o text;
  v_n text;
  v_skip text[] := ARRAY['id', 'code', 'gcode', 'created_at', 'created_by', 'updated_at', 'updated_by'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    r := to_jsonb(OLD);
  ELSE
    r := to_jsonb(NEW);
  END IF;
  v_id := (r->>'id')::smallint;
  v_gcode := r->>'gcode';

  IF TG_TABLE_NAME = 'msggroup' THEN
    v_code := r->>'code';
    v_what := 'グループ';
  ELSE
    IF TG_TABLE_NAME = 'msgoods' THEN
      v_code := r->>'code';
    ELSE
      SELECT g.code INTO v_code FROM msgoods g WHERE g.id = v_id AND g.gcode = v_gcode;
    END IF;
    v_what := CASE TG_TABLE_NAME
      WHEN 'msgoods' THEN '商品 ' || v_gcode
      WHEN 'msgtanka' THEN '単価 ' || v_gcode || ' ' || coalesce(r->>'day', '') || 'から'
      WHEN 'msgsptnk' THEN '特別単価 ' || v_gcode || ' ' || coalesce(r->>'sptnkbn', '') || ' ' || coalesce(r->>'day', '') || 'から'
      WHEN 'msgzai' THEN 'セット構成 ' || v_gcode || ' ' || coalesce(r->>'zcode', '')
      ELSE TG_TABLE_NAME || ' ' || coalesce(v_gcode, '') END;
  END IF;
  v_skip := v_skip || CASE TG_TABLE_NAME WHEN 'msgtanka' THEN ARRAY['day'] WHEN 'msgsptnk' THEN ARRAY['day', 'sptnkbn']
                                         WHEN 'msgzai' THEN ARRAY['zcode'] ELSE ARRAY[]::text[] END;

  IF TG_OP = 'UPDATE' THEN
    o := to_jsonb(OLD);
    FOR k IN SELECT jsonb_object_keys(r) ORDER BY 1 LOOP
      CONTINUE WHEN k = ANY (v_skip);
      v_o := nullif(o->>k, '');
      v_n := nullif(r->>k, '');
      CONTINUE WHEN v_o IS NOT DISTINCT FROM v_n;
      -- 数の列は 空 と 0、8250 と 8250.00 を同じとみなす（画面の保存が 0 を空にするため）
      CONTINUE WHEN (v_o IS NULL OR v_o ~ '^-?[0-9]+(\.[0-9]+)?$') AND (v_n IS NULL OR v_n ~ '^-?[0-9]+(\.[0-9]+)?$')
                AND coalesce(v_o::numeric, 0) = coalesce(v_n::numeric, 0);
      parts := parts || (msgoods_label(v_id, k) || ' ' || coalesce(v_o, '(空)') || '→' || coalesce(v_n, '(空)'));
    END LOOP;
    IF array_length(parts, 1) IS NULL THEN
      RETURN NULL;  -- 保存し直しただけで、何も変わっていない
    END IF;
    v_memo := v_what || ' 変更: ' || array_to_string(parts, ', ');
  ELSIF TG_OP = 'INSERT' THEN
    IF TG_TABLE_NAME IN ('msgtanka', 'msgsptnk', 'msgzai') THEN
      FOR k IN SELECT jsonb_object_keys(r) ORDER BY 1 LOOP
        CONTINUE WHEN k = ANY (v_skip) OR jsonb_typeof(r->k) = 'null' OR r->>k IN ('0', '0.00', '');
        parts := parts || (msgoods_label(v_id, k) || '=' || (r->>k));
      END LOOP;
    ELSIF TG_TABLE_NAME = 'msgoods' THEN
      parts := ARRAY[coalesce(r->>'gtext', '')];
    ELSE
      parts := ARRAY[coalesce(r->>'name', '')];
    END IF;
    v_memo := v_what || ' 追加: ' || array_to_string(parts, ', ');
  ELSE
    v_memo := v_what || ' 削除';
  END IF;

  v_by := coalesce(nullif(r->>'updated_by', ''), nullif(r->>'created_by', ''));
  IF v_by IS NULL AND TG_TABLE_NAME <> 'msggroup' THEN
    BEGIN
      SELECT g.updated_by INTO v_by FROM msggroup g
       WHERE g.id = v_id AND g.code = v_code AND g.xmin::text = (pg_current_xact_id()::xid)::text;
    EXCEPTION WHEN others THEN
      v_by := NULL;
    END;
  END IF;
  IF v_by IS NULL THEN
    BEGIN
      v_by := nullif(current_setting('hasura.user', true), '')::jsonb->>'x-hasura-user-id';
    EXCEPTION WHEN others THEN
      v_by := NULL;
    END;
  END IF;

  INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
  VALUES (v_id, coalesce(v_code, v_gcode, ''), v_gcode, '14', left(v_memo, 2000), coalesce(v_by, ''));
  RETURN NULL;
END
$$ LANGUAGE plpgsql
SET search_path FROM CURRENT;  -- test の商品マスタは test.tropelog に書く（実行時の search_path は public のため）

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['msggroup', 'msgoods', 'msgtanka', 'msgsptnk', 'msgzai'] LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_opelog', t);
      EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION msgoods_opelog()',
                     t || '_opelog', t);
    ELSE
      RAISE NOTICE '表 % がありません（トリガーを付けませんでした）', t;
    END IF;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------
-- Hasura 側の設定（staff の権限）
--   ・msggroup: select / update の列に catpage
--   ・msgtanka: select（全部の列）・insert（価格改定取込で使う）
--   ・msgsptnk: select（全部の列。掛率表で使う）
-- ---------------------------------------------------------------------
