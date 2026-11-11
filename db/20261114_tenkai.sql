-- =====================================================================
-- 展開伝票（trtenden）: 採番・操作ログ
--
--   trtenden は伝票と明細が 1 つのテーブル（行ごとに 日付・倉庫・担当者 を持つ）。
--   区分 kubun: 1 = 出庫（展開元）、0 = 入庫（展開先）。day = 展開依頼日、cday = 展開完了日。
--   在庫は trzaiko の teno（展開出）を依頼日に、teni（展開入）を完了日にアプリが増減する（完了日が入るまで入庫は足さない）。
--
--   ・採番: trnumber の type = 'tdenno'（展開伝票番号）。無ければ、今ある展開伝票の最大の番号から始める
--   ・操作ログ（tropelog、extype = '7' 展開伝票）: 保存（登録・変更）のたびに、1 伝票につき 1 件記録する
--     （画面の保存は 明細の削除 → 登録 なので、登録の文の終わりに 1 行目で記録する。前に記録があれば「展開変更」）
--
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する（すぐ終わる）。
-- 先に確かめること:
--   SELECT * FROM trnumber WHERE id = 1 ORDER BY type;
--     展開伝票の番号の種別が別の名前（'tdenno' 以外）で既にあれば、下の INSERT は流さずに知らせてください
--   SELECT * FROM msbunrui WHERE kubun = 'extype' AND value = '7';   -- 7 = 展開伝票
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

-- 採番（展開伝票番号）。既にあれば何もしない
INSERT INTO trnumber (id, type, curnum)
SELECT c.id, 'tdenno', coalesce((SELECT max(t.denno) FROM trtenden t WHERE t.id = c.id), 0)
  FROM (SELECT DISTINCT id FROM trnumber) c
 WHERE NOT EXISTS (SELECT 1 FROM trnumber n WHERE n.id = c.id AND n.type = 'tdenno');

-- 展開伝票の操作ログ（1 伝票 1 件。AFTER の行トリガーは文の終わりに動くので、同じ保存で登録した全部の行が見える）
CREATE OR REPLACE FUNCTION trtenden_opelog() RETURNS trigger AS $$
DECLARE
  v_memo text;
  v_old boolean;
BEGIN
  IF NEW.line <> (SELECT min(line) FROM trtenden WHERE id = NEW.id AND denno = NEW.denno) THEN
    RETURN NULL;
  END IF;
  SELECT EXISTS (SELECT 1 FROM tropelog WHERE id = NEW.id AND extype = '7' AND keycode = NEW.denno::text) INTO v_old;
  SELECT left(string_agg(CASE WHEN kubun = 1 THEN '出' ELSE '入' END || ' ' || gcode || '×' || suu, ', ' ORDER BY line), 900)
    INTO v_memo
    FROM trtenden WHERE id = NEW.id AND denno = NEW.denno;
  INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
  VALUES (NEW.id, NEW.denno::text, NEW.scode, '7',
          CASE WHEN v_old THEN '展開変更' ELSE '展開登録' END || ' 倉庫=' || coalesce(NEW.scode, '')
          || ' 依頼日=' || coalesce(NEW.day::text, '') || ' 完了日=' || coalesce(NEW.cday::text, '未完了')
          || ' ' || coalesce(v_memo, ''),
          coalesce(NEW.updated_by, NEW.created_by));
  RETURN NULL;
END
$$ LANGUAGE plpgsql
SET search_path FROM CURRENT;  -- test の展開伝票は test.tropelog に書く（実行時の search_path は public のため）

DROP TRIGGER IF EXISTS trtenden_opelog ON trtenden;
CREATE TRIGGER trtenden_opelog
  AFTER INSERT ON trtenden
  FOR EACH ROW EXECUTE FUNCTION trtenden_opelog();

-- ---------------------------------------------------------------------
-- Hasura 側の設定（staff の権限）
--   ・trtenden: select / insert / delete（全部の列）。trzaiko は移動伝票と同じ（teni, teno を含む）
--   ・trnumber: 'tdenno' の採番（他の伝票番号と同じ update の権限で使える）
-- ---------------------------------------------------------------------
