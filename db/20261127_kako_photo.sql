-- =====================================================================
-- 加工指示・加工マスタに「商品の写真」を足す（道着・帯の絵がない商品〈ファールカップ・スポーツブラなど〉の指示書用。
-- 加工する場所が分かる写真。画像の data URL）
--
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する。
-- そのあと Hasura の staff の権限（trkako・mskako の select / insert / update）に photo を足す（1 つずつ保存する）。
-- ※ アプリを反映する前に実行すること（反映したアプリは photo を読むので、列が無いと加工指示を開けない）
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

ALTER TABLE trkako ADD COLUMN IF NOT EXISTS photo text;
COMMENT ON COLUMN trkako.photo IS '商品の写真（加工する場所が分かるもの。画像の data URL）';

ALTER TABLE mskako ADD COLUMN IF NOT EXISTS photo text;
COMMENT ON COLUMN mskako.photo IS '商品の写真（加工する場所が分かるもの。画像の data URL）';

-- ---------------------------------------------------------------------
-- 操作ログ（db/20261123_kako.sql の trkako_opelog を置き換え）。
-- 写真（photo）は中身（長い画像のデータ）を書かず「写真 変更」とだけ残す。tdenno（展開伝票）の名前も付ける
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trkako_opelog() RETURNS trigger AS $$
DECLARE
  r jsonb;
  o jsonb;
  k text;
  parts text[] := '{}';
  v_o text;
  v_n text;
  v_memo text;
  v_names text[] := ARRAY['依頼', '倉庫から発送', '加工先で受取', '加工済・発送', '倉庫で受取', '出荷済'];
  v_skip text[] := ARRAY['id', 'kno', 'kym', 'kseq', 'renban', 'status', 'created_at', 'created_by', 'updated_at', 'updated_by',
                         's2_at', 's2_by', 's3_at', 's3_by', 's4_at', 's4_by', 's5_at', 's5_by', 's6_at', 's6_by', 'photo'];
  v_label text;
BEGIN
  r := to_jsonb(NEW);
  IF TG_OP = 'INSERT' THEN
    v_memo := '加工依頼 登録 連番=' || NEW.renban || ' 加工先=' || NEW.dcode
              || CASE WHEN NEW.tdenno IS NOT NULL THEN ' 展開=' || NEW.tdenno ELSE ' 受注=' || coalesce(NEW.jdenno::text, '') END
              || ' 依頼日=' || NEW.reqday || coalesce(' 希望納期=' || NEW.wishday, '') || coalesce(' ' || NEW.naiyo, '')
              || CASE WHEN NEW.photo IS NOT NULL THEN ' 写真あり' ELSE '' END;
  ELSE
    o := to_jsonb(OLD);
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      parts := parts || ('状態 ' || coalesce(v_names[OLD.status], OLD.status::text) || '→' || coalesce(v_names[NEW.status], NEW.status::text));
    END IF;
    FOR k IN SELECT jsonb_object_keys(r) ORDER BY 1 LOOP
      CONTINUE WHEN k = ANY (v_skip);
      v_o := nullif(o->>k, '');
      v_n := nullif(r->>k, '');
      CONTINUE WHEN v_o IS NOT DISTINCT FROM v_n;
      v_label := CASE k WHEN 'jdenno' THEN '受注' WHEN 'tdenno' THEN '展開' WHEN 'mcode' THEN '顧客' WHEN 'mname' THEN '顧客名' WHEN 'kind' THEN '種類'
        WHEN 'dtype' THEN '加工先の種類' WHEN 'dcode' THEN '加工先' WHEN 'rscode' THEN '納品場所' WHEN 'tcode' THEN '内勤'
        WHEN 'reqday' THEN '依頼日' WHEN 'wishday' THEN '希望納期' WHEN 'planday' THEN '予定納期' WHEN 'doukon' THEN '同梱'
        WHEN 'naiyo' THEN '加工内容' WHEN 'memo' THEN '備考' WHEN 'del' THEN '取消' ELSE k END;
      parts := parts || (v_label || ' ' || coalesce(v_o, '(空)') || '→' || coalesce(v_n, '(空)'));
    END LOOP;
    IF NEW.photo IS DISTINCT FROM OLD.photo THEN
      parts := parts || ('写真 ' || CASE WHEN NEW.photo IS NULL THEN '削除' WHEN OLD.photo IS NULL THEN '追加' ELSE '変更' END);
    END IF;
    IF NEW.renban IS DISTINCT FROM OLD.renban THEN
      parts := parts || ('連番 ' || OLD.renban || '→' || NEW.renban);
    END IF;
    IF array_length(parts, 1) IS NULL THEN
      v_memo := '加工依頼 変更（明細）';
    ELSE
      v_memo := '加工依頼 変更: ' || array_to_string(parts, ', ');
    END IF;
  END IF;
  INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
  VALUES (NEW.id, NEW.kno::text, coalesce(NEW.jdenno, NEW.tdenno)::text, '9', left(v_memo, 2000), coalesce(NEW.updated_by, NEW.created_by, ''));
  RETURN NULL;
END
$$ LANGUAGE plpgsql
SET search_path FROM CURRENT;  -- test の加工指示は test.tropelog に書く
