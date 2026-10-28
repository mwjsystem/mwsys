-- =====================================================================
-- 請求書の送付の進捗（20261028_seikyu_history.sql の適用後に実行する）
--
--   trseikyu.sstatus: 0 未確認 → 1 経理確認済 → 2 営業確認依頼済 → 3 営業OK → 4 顧客送付済
--     ・1 段階ずつしか進めない・戻せない（DB のトリガーで制限）
--     ・最後に進めた／戻した日時と担当者を sstatus_at / sstatus_by に持つ
--     ・変更の履歴は tropelog（extype = '5'、memo「進捗 …」）に記録する
--   移行データの請求伝票（created_at が NULL）は、現行システムで送付済として 4 にする。
--
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する（すぐ終わる）。
--   実行後、Hasura の権限を設定する（末尾の注記参照）。
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

ALTER TABLE trseikyu
    ADD COLUMN IF NOT EXISTS sstatus    smallint NOT NULL DEFAULT 0
  , ADD COLUMN IF NOT EXISTS sstatus_at timestamp(6) with time zone
  , ADD COLUMN IF NOT EXISTS sstatus_by text;
COMMENT ON COLUMN trseikyu.sstatus IS '送付の進捗: 0 未確認 / 1 経理確認済 / 2 営業確認依頼済 / 3 営業OK / 4 顧客送付済';

-- 移行データは送付済
UPDATE trseikyu SET sstatus = 4 WHERE created_at IS NULL AND sstatus = 0;

-- 進捗は 1 段階ずつ。取消済の請求伝票の進捗は変えられない。顧客送付済の請求伝票は取り消せない
CREATE OR REPLACE FUNCTION trseikyu_check_status() RETURNS trigger AS $$
BEGIN
  IF NEW.sstatus IS DISTINCT FROM OLD.sstatus THEN
    IF OLD.del THEN
      RAISE EXCEPTION '請求伝票%は取消済のため進捗を変更できません', OLD.denno;
    END IF;
    IF NEW.sstatus NOT BETWEEN 0 AND 4 OR abs(NEW.sstatus - OLD.sstatus) <> 1 THEN
      RAISE EXCEPTION '請求伝票%の進捗は 1 段階ずつしか変更できません（% → %）', OLD.denno, OLD.sstatus, NEW.sstatus;
    END IF;
  END IF;
  IF NEW.del AND NOT OLD.del AND OLD.sstatus >= 4 THEN
    RAISE EXCEPTION '請求伝票%は顧客へ送付済のため取り消せません（進捗を戻してから取り消してください）', OLD.denno;
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trseikyu_check_status ON trseikyu;
CREATE TRIGGER trseikyu_check_status
  BEFORE UPDATE OF sstatus, del ON trseikyu
  FOR EACH ROW EXECUTE FUNCTION trseikyu_check_status();

-- 操作の記録（tropelog）に進捗の変更を加える
CREATE OR REPLACE FUNCTION trseikyu_opelog() RETURNS trigger AS $$
DECLARE
  names text[] := ARRAY['未確認', '経理確認済', '営業確認依頼済', '営業OK', '顧客送付済'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.mcode, '5',
            '請求登録 締め日=' || NEW.sday || ' 今回請求額=' || coalesce(NEW.seikyu, 0) || ' 伝票数=' || coalesce(NEW.dencnt, 0),
            NEW.created_by);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.del AND NOT OLD.del THEN
      INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
      VALUES (NEW.id, NEW.denno::text, NEW.mcode, '5',
              '請求取消 締め日=' || NEW.sday || ' 今回請求額=' || coalesce(NEW.seikyu, 0),
              NEW.updated_by);
    END IF;
    IF NEW.sstatus IS DISTINCT FROM OLD.sstatus THEN
      INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
      VALUES (NEW.id, NEW.denno::text, NEW.mcode, '5',
              '進捗 ' || names[OLD.sstatus + 1] || ' → ' || names[NEW.sstatus + 1],
              NEW.sstatus_by);
    END IF;
  END IF;
  RETURN NULL;
END
$$ LANGUAGE plpgsql
SET search_path FROM CURRENT;  -- test の請求伝票は test.tropelog に記録する（実行時の search_path は public のため）

DROP TRIGGER IF EXISTS trseikyu_opelog ON trseikyu;
CREATE TRIGGER trseikyu_opelog
  AFTER INSERT OR UPDATE OF del, sstatus ON trseikyu
  FOR EACH ROW EXECUTE FUNCTION trseikyu_opelog();

-- ---------------------------------------------------------------------
-- Hasura 側の設定
--   ・trseikyu の select 権限に sstatus, sstatus_at, sstatus_by を含める
--   ・trseikyu の update 権限に sstatus, sstatus_at, sstatus_by を含める
-- ---------------------------------------------------------------------
