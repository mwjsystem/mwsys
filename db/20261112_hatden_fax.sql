-- =====================================================================
-- 発注伝票の FAX の流れ（手で更新する）
--   ① 発注書を印刷して発注先へ FAX     : ofax_at / ofax_by
--   ② 発注先から Refax（納期の回答）受領 : refax_at / refax_by
--   ③ Refax を倉庫へ FAX                : sfax_at / sfax_by
--   ・発注伝票の画面のボタンで、日時と担当者を入れる（もう一度押すと取り消し）。伝票の更新日時は変えない
--   ・入れた・取り消したことは操作ログ（tropelog、extype = '2' 発注伝票）に残す
--
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する（すぐ終わる）。
-- 先に db/20261111_hatden_order.sql を流しておくこと（同じトリガー関数を置き換える）
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

ALTER TABLE trhatden ADD COLUMN IF NOT EXISTS ofax_at timestamptz;
ALTER TABLE trhatden ADD COLUMN IF NOT EXISTS ofax_by text;
ALTER TABLE trhatden ADD COLUMN IF NOT EXISTS refax_at timestamptz;
ALTER TABLE trhatden ADD COLUMN IF NOT EXISTS refax_by text;
ALTER TABLE trhatden ADD COLUMN IF NOT EXISTS sfax_at timestamptz;
ALTER TABLE trhatden ADD COLUMN IF NOT EXISTS sfax_by text;
COMMENT ON COLUMN trhatden.ofax_at IS '① 発注先へFAXした日時';
COMMENT ON COLUMN trhatden.refax_at IS '② 発注先からRefaxを受け取った日時';
COMMENT ON COLUMN trhatden.sfax_at IS '③ Refaxを倉庫へFAXした日時';

-- 発注伝票の操作ログ（db/20261111_hatden_order.sql の関数に、FAX の流れの記録を足したもの）
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

  -- FAX の流れ（画面のボタン。伝票の更新日時は変えない）
  IF NEW.ofax_at IS DISTINCT FROM OLD.ofax_at THEN
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.vcode, '2',
            CASE WHEN NEW.ofax_at IS NULL THEN '①発注先へFAX 取消' ELSE '①発注先へFAX 済' END,
            coalesce(NEW.ofax_by, OLD.ofax_by));
  END IF;
  IF NEW.refax_at IS DISTINCT FROM OLD.refax_at THEN
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.vcode, '2',
            CASE WHEN NEW.refax_at IS NULL THEN '②Refax受領 取消' ELSE '②Refax受領 済' END,
            coalesce(NEW.refax_by, OLD.refax_by));
  END IF;
  IF NEW.sfax_at IS DISTINCT FROM OLD.sfax_at THEN
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.vcode, '2',
            CASE WHEN NEW.sfax_at IS NULL THEN '③倉庫へFAX 取消' ELSE '③倉庫へFAX 済' END,
            coalesce(NEW.sfax_by, OLD.sfax_by));
  END IF;

  -- 画面からの保存（updated_at が変わる更新）
  IF NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
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
SET search_path FROM CURRENT;  -- test の発注伝票は test.tropelog に書く（実行時の search_path は public のため）

-- ---------------------------------------------------------------------
-- Hasura 側の設定（staff の権限）
--   ・trhatden: select と update の列に ofax_at, ofax_by, refax_at, refax_by, sfax_at, sfax_by を含める
-- ---------------------------------------------------------------------
