-- =====================================================================
-- 受注伝票のピッキング（倉庫のスマホで出荷指示書の QR コードと商品の JAN を読んで確認する）
--
--   1. trjyuden に列を追加する
--        pick_at / pick_by : ピッキングの確認が終わった日時・担当者
--   2. 受注ステータス（分類マスタ kubun = 'jdstatus'）に 5 ピッキング済 を追加する
--   3. 受注伝票の操作の記録（trjyuden_opelog）に、ピッキング完了を残す
--
-- 前提: 20261028_jyuden_ship.sql を適用済み
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する（すぐ終わる）。
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

-- 1. 列の追加
ALTER TABLE trjyuden ADD COLUMN IF NOT EXISTS pick_at timestamptz;
ALTER TABLE trjyuden ADD COLUMN IF NOT EXISTS pick_by text;
COMMENT ON COLUMN trjyuden.pick_at IS 'ピッキングの確認が終わった日時';
COMMENT ON COLUMN trjyuden.pick_by IS 'ピッキングの確認をした担当者（担当者コード）';

-- 2. 分類マスタ
DELETE FROM msbunrui WHERE id = 1 AND kubun = 'jdstatus' AND value = '5';
INSERT INTO msbunrui (id, kubun, value, viewval) VALUES (1, 'jdstatus', '5', 'ピッキング済');

-- 3. 操作の記録
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

  -- 出荷指示フォルダの作成／倉庫での出力／ピッキング（受注伝票の保存とは別に、出荷の画面から更新される）
  IF NEW.ship_at IS DISTINCT FROM OLD.ship_at AND NEW.ship_at IS NOT NULL THEN
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.mcode, '1', '出荷指示フォルダ作成 ' || coalesce(NEW.shipdir, ''), NEW.ship_by);
  END IF;
  IF NEW.print_at IS DISTINCT FROM OLD.print_at AND NEW.print_at IS NOT NULL THEN
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.mcode, '1', '出荷指示出力 ' || coalesce(NEW.shipdir, ''), NEW.print_by);
  END IF;
  IF NEW.pick_at IS DISTINCT FROM OLD.pick_at AND NEW.pick_at IS NOT NULL THEN
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.mcode, '1', 'ピッキング完了', NEW.pick_by);
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
       WHERE n.key NOT IN ('updated_at', 'updated_by', 'created_at', 'created_by', 'idenno',
                           'shipdir', 'ship_at', 'ship_by', 'print_at', 'print_by', 'pick_at', 'pick_by')
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

-- ---------------------------------------------------------------------
-- Hasura 側の設定
--   ・Reload metadata
--   ・trjyuden の select / update 権限（staff）に pick_at, pick_by を含める
--   ・msgoods の select 権限（staff）に jan が含まれていること
-- ---------------------------------------------------------------------
