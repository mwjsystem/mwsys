-- =====================================================================
-- 発注外入荷伝票（trhgnden）: 採番・操作ログ・在庫の列の NULL 対策
--
--   trhgnden は伝票と明細が 1 つのテーブル（行ごとに 日付・倉庫・担当者 を持つ）。
--   在庫は trzaiko の nyuk（入庫）にアプリが suu を足す（仕入伝票は hnyu）。
--
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する。
-- 先に確かめること:
--   (1) 現行の発注外入荷が trzaiko の nyuk に入っているか（日付・倉庫・商品ごとに合えば nyuk）
--       SELECT h.day, h.scode, h.gcode, sum(h.suu) AS hgn, max(z.nyuk) AS nyuk, max(z.hnyu) AS hnyu
--         FROM trhgnden h LEFT JOIN trzaiko z ON z.id = h.id AND z.scode = h.scode AND z.gcode = h.gcode AND z.day = h.day
--        GROUP BY h.day, h.scode, h.gcode ORDER BY h.day DESC LIMIT 50;
--       → hgn と nyuk が合っていれば nyuk（アプリの今の作り）。合わなければ知らせてください
--   操作ログの作業区分は、分類マスタに既にある extype = '10'（入荷伝票）を使う（13 は顧客マスタのため）
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

-- ---------------------------------------------------------------------
-- 1. 在庫の列の NULL 対策（nyuk に NULL があると足し算しても NULL のままになる）
-- ---------------------------------------------------------------------
UPDATE trzaiko SET nyuk = 0 WHERE nyuk IS NULL;
ALTER TABLE trzaiko ALTER COLUMN nyuk SET DEFAULT 0;

-- ---------------------------------------------------------------------
-- 2. 採番（発注外入荷伝票番号）。無ければ、今ある伝票の最大の番号から始める
-- ---------------------------------------------------------------------
INSERT INTO trnumber (id, type, curnum, memo)
SELECT c.id, 'gdenno', coalesce((SELECT max(t.denno) FROM trhgnden t WHERE t.id = c.id), 0), '発注外入荷伝票番号'
  FROM (SELECT DISTINCT id FROM trnumber) c
 WHERE NOT EXISTS (SELECT 1 FROM trnumber n WHERE n.id = c.id AND n.type = 'gdenno');

-- ---------------------------------------------------------------------
-- 3. 操作ログ（tropelog、extype = '10' 入荷伝票）。保存のたびに 1 伝票につき 1 件
--    （画面の保存は 明細の削除 → 登録 なので、登録の文の終わりに 1 行目で記録する。前に記録があれば「入荷変更」）
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trhgnden_opelog() RETURNS trigger AS $$
DECLARE
  v_memo text;
  v_old boolean;
BEGIN
  IF NEW.line <> (SELECT min(line) FROM trhgnden WHERE id = NEW.id AND denno = NEW.denno) THEN
    RETURN NULL;
  END IF;
  SELECT EXISTS (SELECT 1 FROM tropelog WHERE id = NEW.id AND extype = '10' AND keycode = NEW.denno::text) INTO v_old;
  SELECT left(string_agg(gcode || ' +' || suu, ', ' ORDER BY line), 900)
    INTO v_memo
    FROM trhgnden WHERE id = NEW.id AND denno = NEW.denno;
  INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
  VALUES (NEW.id, NEW.denno::text, NEW.scode, '10',
          CASE WHEN v_old THEN '入荷変更' ELSE '入荷登録' END || ' 倉庫=' || coalesce(NEW.scode, '') || ' 日付=' || coalesce(NEW.day::text, '')
          || ' ' || coalesce(v_memo, ''),
          coalesce(NEW.updated_by, NEW.created_by));
  RETURN NULL;
END
$$ LANGUAGE plpgsql
SET search_path FROM CURRENT;  -- test の伝票は test.tropelog に書く（実行時の search_path は public のため）

DROP TRIGGER IF EXISTS trhgnden_opelog ON trhgnden;
CREATE TRIGGER trhgnden_opelog
  AFTER INSERT ON trhgnden
  FOR EACH ROW EXECUTE FUNCTION trhgnden_opelog();

-- ---------------------------------------------------------------------
-- Hasura 側の設定（staff の権限）
--   ・trhgnden: テーブルを Track し、select / insert / delete（全部の列）
--   ・trzaiko: update と insert の列に nyuk
-- ---------------------------------------------------------------------
