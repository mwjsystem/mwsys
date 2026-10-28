-- =====================================================================
-- 受注伝票の操作の記録（tropelog、extype = '1' 受注伝票）
--
--   ・受注登録        : 受注伝票の登録
--   ・受注変更        : 画面からの保存（updated_at が変わる更新）。変わった項目（列名）と合計の変更前後を memo に残す
--   ・受注取消／取消解除
--   ・請求計上／請求解除 : 締め処理で請求伝票に計上されたとき（idenno が設定された）／請求取消で外れたとき
--   memo の「項目=」は列名（画面では項目名に変換して表示する）。明細（trjyumei）だけの変更は合計が変わらない限り
--   「ヘッダの変更なし」と記録される。
--
--   データ移行の投入中は、移行用SQL（db/migration/01_before_load.sql）でこのトリガーを止め、
--   02_after_load.sql の最後で戻す（移行データの登録・紐づけを記録しないため）。
--
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する（すぐ終わる）。
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

CREATE OR REPLACE FUNCTION trjyuden_opelog() RETURNS trigger AS $$
DECLARE
  -- 列名（tropelog.memo など）と区別するため v_ を付ける
  v_cols text;
  v_memo text;
  v_who  text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.mcode, '1',
            '受注登録 受注先=' || coalesce(NEW.mcode, '') || ' 請求先=' || coalesce(NEW.scde, '') || ' 合計=' || coalesce(NEW.total, 0),
            NEW.created_by);
    RETURN NULL;
  END IF;

  -- 請求計上／請求解除（0 と NULL の間の変更は記録しない）
  IF coalesce(NEW.idenno, 0) IS DISTINCT FROM coalesce(OLD.idenno, 0) THEN
    IF coalesce(NEW.idenno, 0) > 0 THEN
      SELECT s.created_by INTO v_who FROM trseikyu s WHERE s.id = NEW.id AND s.denno = NEW.idenno;
      v_memo := '請求計上 請求伝票=' || NEW.idenno;
    ELSE
      SELECT s.updated_by INTO v_who FROM trseikyu s WHERE s.id = OLD.id AND s.denno = OLD.idenno;
      v_memo := '請求解除 請求伝票=' || OLD.idenno;
    END IF;
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.mcode, '1', v_memo, v_who);
  END IF;

  -- 画面からの保存・取消・取消解除
  IF NEW.updated_at IS DISTINCT FROM OLD.updated_at OR coalesce(NEW.del, false) IS DISTINCT FROM coalesce(OLD.del, false) THEN
    IF coalesce(NEW.del, false) AND NOT coalesce(OLD.del, false) THEN
      v_memo := '受注取消';
    ELSIF NOT coalesce(NEW.del, false) AND coalesce(OLD.del, false) THEN
      v_memo := '受注取消解除';
    ELSE
      SELECT string_agg(n.key, ',' ORDER BY n.key) INTO v_cols
        FROM jsonb_each(to_jsonb(NEW)) n
       WHERE n.key NOT IN ('updated_at', 'updated_by', 'created_at', 'created_by', 'idenno')
         AND n.value IS DISTINCT FROM (to_jsonb(OLD) -> n.key);
      v_memo := '受注変更' || CASE WHEN v_cols IS NULL THEN '（ヘッダの変更なし）' ELSE ' 項目=' || v_cols END
             || CASE WHEN NEW.total IS DISTINCT FROM OLD.total
                     THEN ' 合計=' || coalesce(OLD.total, 0) || '→' || coalesce(NEW.total, 0) ELSE '' END;
    END IF;
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.mcode, '1', v_memo, NEW.updated_by);
  END IF;
  RETURN NULL;
END
$$ LANGUAGE plpgsql
SET search_path FROM CURRENT;  -- test の受注伝票は test.tropelog / test.trseikyu を見る（実行時の search_path は public のため）

DROP TRIGGER IF EXISTS trjyuden_opelog ON trjyuden;
CREATE TRIGGER trjyuden_opelog
  AFTER INSERT OR UPDATE ON trjyuden
  FOR EACH ROW EXECUTE FUNCTION trjyuden_opelog();

-- 操作ログの表示で、伝票番号から記録を引くための索引
CREATE INDEX IF NOT EXISTS tropelog_key_idx ON tropelog (id, extype, keycode);

-- ---------------------------------------------------------------------
-- Hasura 側の設定
--   ・tropelog の select 権限（staff）に、sequ, keycode, subkeycd, extype, memo, created_by, created_at を含める
-- ---------------------------------------------------------------------
