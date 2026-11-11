-- =====================================================================
-- 移動伝票: 受注伝票の在庫不足から作る移動伝票・倉庫での数量確認（QR → JAN）・操作ログ
--
--   ・trmovden.jdenno / jline : 受注伝票の在庫不足から作った移動明細の、受注伝票番号・行番号（列が既にあれば何もしない）
--   ・trmovsub.chk_at / chk_by / chkmemo : 倉庫のスマホで数量を確認した日時・担当者・内容（数量を直した明細など）
--   ・操作ログ（tropelog、extype = '6' 移動伝票）: 登録・変更・倉庫確認
--   ・発注伝票の操作ログの手直し（FAX の流れのボタンで「発注変更」が余計に記録されないように）
--
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する（すぐ終わる）。
-- 先に確かめること:
--   SELECT * FROM msbunrui WHERE kubun = 'extype' AND value = '6';   -- 6 = 移動伝票
--   SELECT tgname FROM pg_trigger WHERE tgrelid = 'trmovsub'::regclass AND NOT tgisinternal;
--     （移動伝票の操作ログのトリガーが既にあれば、記録が二重になるので知らせてください）
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

ALTER TABLE trmovden ADD COLUMN IF NOT EXISTS jdenno integer;
ALTER TABLE trmovden ADD COLUMN IF NOT EXISTS jline integer;
ALTER TABLE trmovsub ADD COLUMN IF NOT EXISTS chk_at timestamptz;
ALTER TABLE trmovsub ADD COLUMN IF NOT EXISTS chk_by text;
ALTER TABLE trmovsub ADD COLUMN IF NOT EXISTS chkmemo text;
COMMENT ON COLUMN trmovsub.chk_at IS '倉庫で数量を確認した日時（スマホで QR → JAN）';
COMMENT ON COLUMN trmovsub.chkmemo IS '倉庫で確認したときの内容（数量を直した明細など）';

CREATE OR REPLACE FUNCTION trmovsub_opelog() RETURNS trigger AS $$
DECLARE
  v_cols text;
  v_memo text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.outcode, '6',
            '移動登録 出庫=' || coalesce(NEW.outcode, '') || ' 入庫=' || coalesce(NEW.incode, '')
            || CASE WHEN coalesce(NEW.dmemo, '') LIKE '受注伝票%' THEN '（' || NEW.dmemo || '）' ELSE '' END,
            NEW.created_by);
    RETURN NULL;
  END IF;

  -- 倉庫での数量確認（スマホ）
  IF NEW.chk_at IS DISTINCT FROM OLD.chk_at AND NEW.chk_at IS NOT NULL THEN
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.outcode, '6', '倉庫確認 ' || coalesce(NEW.chkmemo, ''), NEW.chk_by);
  END IF;

  -- 画面からの保存（updated_at が変わる更新）。
  -- updated_at は Hasura のトリガー（set_..._updated_at）で、どの更新でも変わるので、倉庫確認の更新では記録しない
  IF NEW.updated_at IS DISTINCT FROM OLD.updated_at AND NEW.chk_at IS NOT DISTINCT FROM OLD.chk_at THEN
    SELECT string_agg(n.key, ',' ORDER BY n.key) INTO v_cols
      FROM jsonb_each(to_jsonb(NEW)) n
     WHERE n.key NOT IN ('updated_at', 'updated_by', 'created_at', 'created_by', 'chk_at', 'chk_by', 'chkmemo')
       AND n.value IS DISTINCT FROM (to_jsonb(OLD) -> n.key);
    v_memo := '移動変更' || CASE WHEN v_cols IS NULL THEN '（ヘッダの変更なし）' ELSE ' 項目=' || v_cols END;
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.outcode, '6', v_memo, NEW.updated_by);
  END IF;
  RETURN NULL;
END
$$ LANGUAGE plpgsql
SET search_path FROM CURRENT;  -- test の移動伝票は test.tropelog に書く（実行時の search_path は public のため）

DROP TRIGGER IF EXISTS trmovsub_opelog ON trmovsub;
CREATE TRIGGER trmovsub_opelog
  AFTER INSERT OR UPDATE ON trmovsub
  FOR EACH ROW EXECUTE FUNCTION trmovsub_opelog();

-- ---------------------------------------------------------------------
-- 発注伝票の操作ログの手直し（db/20261112_hatden_fax.sql の関数を置き換える）。
-- trhatden にも Hasura の updated_at のトリガーがあると、FAX の流れ（①②③）のボタンでも updated_at が変わり、
-- 「発注変更（ヘッダの変更なし）」が余計に記録されるため、FAX の流れの更新では記録しない
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trhatden_opelog() RETURNS trigger AS $$
DECLARE
  v_cols text;
  v_memo text;
  v_fax boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.vcode, '2',
            '発注登録 仕入先=' || coalesce(NEW.vcode, '') || ' 倉庫=' || coalesce(NEW.scode, '') || ' 合計=' || coalesce(NEW.total, 0)
            || CASE WHEN coalesce(NEW.dmemo, '') LIKE '受注伝票%から自動作成' THEN '（' || NEW.dmemo || '）' ELSE '' END,
            NEW.created_by);
    RETURN NULL;
  END IF;

  v_fax := NEW.ofax_at IS DISTINCT FROM OLD.ofax_at OR NEW.refax_at IS DISTINCT FROM OLD.refax_at OR NEW.sfax_at IS DISTINCT FROM OLD.sfax_at;
  IF NEW.ofax_at IS DISTINCT FROM OLD.ofax_at THEN
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.vcode, '2',
            CASE WHEN NEW.ofax_at IS NULL THEN '①発注先へFAX 取消' ELSE '①発注先へFAX 済' END, coalesce(NEW.ofax_by, OLD.ofax_by));
  END IF;
  IF NEW.refax_at IS DISTINCT FROM OLD.refax_at THEN
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.vcode, '2',
            CASE WHEN NEW.refax_at IS NULL THEN '②Refax受領 取消' ELSE '②Refax受領 済' END, coalesce(NEW.refax_by, OLD.refax_by));
  END IF;
  IF NEW.sfax_at IS DISTINCT FROM OLD.sfax_at THEN
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.vcode, '2',
            CASE WHEN NEW.sfax_at IS NULL THEN '③倉庫へFAX 取消' ELSE '③倉庫へFAX 済' END, coalesce(NEW.sfax_by, OLD.sfax_by));
  END IF;

  IF NEW.updated_at IS DISTINCT FROM OLD.updated_at AND NOT v_fax THEN
    SELECT string_agg(n.key, ',' ORDER BY n.key) INTO v_cols
      FROM jsonb_each(to_jsonb(NEW)) n
     WHERE n.key NOT IN ('updated_at', 'updated_by', 'created_at', 'created_by',
                         'ofax_at', 'ofax_by', 'refax_at', 'refax_by', 'sfax_at', 'sfax_by')
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
SET search_path FROM CURRENT;

-- ---------------------------------------------------------------------
-- Hasura 側の設定（staff の権限）
--   ・trmovden: select / insert / update の列に jdenno, jline（update は suu も。倉庫確認で数量を直すため）
--   ・trmovsub: select / update の列に chk_at, chk_by, chkmemo
-- ---------------------------------------------------------------------
