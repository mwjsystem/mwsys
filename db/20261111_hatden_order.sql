-- =====================================================================
-- 受発注の発注伝票（受注伝票の保存で自動作成）・発注伝票の在庫更新・操作ログ
--
--   ・trzaiko.hatu : 在庫の発注数（現行の ZAIKO.HATU）。発注伝票の登録・変更で、倉庫・商品・発注日ごとに増減する
--                    （受注伝票から自動で作った発注伝票も同じ）。列が既にあれば何もしない
--   ・操作ログ      : 発注伝票の登録・変更を tropelog に記録する（extype = '2' 発注伝票）
--                    受注伝票から自動で作った発注伝票は「発注登録（受注伝票 n から自動作成）」と記録する
--
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する（すぐ終わる）。
-- 先に、分類マスタ（msbunrui）の作業区分（kubun = 'extype'）で '2' が発注伝票か確かめること:
--   SELECT * FROM msbunrui WHERE kubun = 'extype' ORDER BY code;
--   '2' が別の伝票なら、下の '2'（3 か所）と、アプリの EXTYPE_HATDEN（src/app/frmsupply/hatmei.service.ts）を同じ値に直す。
--   '2' が無ければ、作業ログの画面で名前が出るように msbunrui に（kubun = 'extype', code = '2', 名前 = 発注伝票）を足す。
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

-- 在庫の発注数（test には既にある。無い環境だけ追加される）
ALTER TABLE trzaiko ADD COLUMN IF NOT EXISTS hatu numeric DEFAULT 0;

-- 発注伝票の操作ログ
CREATE OR REPLACE FUNCTION trhatden_opelog() RETURNS trigger AS $$
DECLARE
  v_cols text;
  v_memo text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.vcode, '2',
            '発注登録 仕入先=' || coalesce(NEW.vcode, '') || ' 倉庫=' || coalesce(NEW.scode, '') || ' 合計=' || coalesce(NEW.total, 0)
            || CASE WHEN coalesce(NEW.dmemo, '') LIKE '受注伝票%から自動作成' THEN '（' || NEW.dmemo || '）' ELSE '' END,
            NEW.created_by);
    RETURN NULL;
  END IF;

  -- 画面からの保存（updated_at が変わる更新）
  IF NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
    SELECT string_agg(n.key, ',' ORDER BY n.key) INTO v_cols
      FROM jsonb_each(to_jsonb(NEW)) n
     WHERE n.key NOT IN ('updated_at', 'updated_by', 'created_at', 'created_by')
       AND n.value IS DISTINCT FROM (to_jsonb(OLD) -> n.key);
    v_memo := '発注変更' || CASE WHEN v_cols IS NULL THEN '（ヘッダの変更なし）' ELSE ' 項目=' || v_cols END
           || CASE WHEN NEW.total IS DISTINCT FROM OLD.total
                   THEN ' 合計=' || coalesce(OLD.total, 0) || '→' || coalesce(NEW.total, 0) ELSE '' END;
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.vcode, '2', v_memo, NEW.updated_by);
  END IF;
  RETURN NULL;
END
$$ LANGUAGE plpgsql
SET search_path FROM CURRENT;  -- test の発注伝票は test.tropelog に書く（実行時の search_path は public のため）

DROP TRIGGER IF EXISTS trhatden_opelog ON trhatden;
CREATE TRIGGER trhatden_opelog
  AFTER INSERT OR UPDATE ON trhatden
  FOR EACH ROW EXECUTE FUNCTION trhatden_opelog();

-- ---------------------------------------------------------------------
-- Hasura 側の設定（staff の権限）
--   ・trzaiko: insert と update の列に hatu を含める（select にも hatu）
--   ・trhatden / trhatmei: insert の権限（受注伝票の保存で発注伝票を作るため。発注伝票の画面と同じ列）
-- ---------------------------------------------------------------------
