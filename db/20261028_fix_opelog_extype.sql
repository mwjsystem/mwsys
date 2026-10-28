-- test 用: 請求登録・取消の操作記録（tropelog）の extype を '5'（掛請求伝票）に変更する。
-- 20261028_seikyu_history.sql を適用済みの test に対して実行する（本番は修正済みの 20261028_seikyu_history.sql を使う）。
SET search_path TO test;

CREATE OR REPLACE FUNCTION trseikyu_opelog() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.mcode, '5',
            '請求登録 締め日=' || NEW.sday || ' 今回請求額=' || coalesce(NEW.seikyu, 0) || ' 伝票数=' || coalesce(NEW.dencnt, 0),
            NEW.created_by);
  ELSIF TG_OP = 'UPDATE' AND NEW.del AND NOT OLD.del THEN
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.mcode, '5',
            '請求取消 締め日=' || NEW.sday || ' 今回請求額=' || coalesce(NEW.seikyu, 0),
            NEW.updated_by);
  END IF;
  RETURN NULL;
END
$$ LANGUAGE plpgsql
SET search_path FROM CURRENT;

-- 既に記録した分を直す
UPDATE tropelog SET extype = '5' WHERE extype IN ('SEIKYU_INS', 'SEIKYU_DEL');

-- tropelog.sequ のシーケンスを既存データの最大値に合わせる（未実行の場合のため。何度実行してもよい）
SELECT setval(pg_get_serial_sequence('tropelog', 'sequ'), (SELECT max(sequ) FROM tropelog));
