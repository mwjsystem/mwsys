-- =====================================================================
-- 在庫調整伝票（trchoden。現行の破棄伝票）: 採番・理由・操作ログ・在庫の列の NULL 対策
--
--   trchoden は伝票と明細が 1 つのテーブル（行ごとに 日付・倉庫・担当者 を持つ）。理由コード chokbn は分類マスタ hakikbn。
--   数量 suu は在庫を減らす数（今までの破棄伝票と同じ）。原因不明で在庫が増えたときは負の数で記録する。
--   在庫は trzaiko の haki（破棄）にアプリが suu を足す（増えたときは負の数を足すので、在庫が増える）。
--
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する。
-- 先に確かめること:
--   SELECT * FROM msbunrui WHERE kubun = 'extype' AND value = '11';   -- 11 = 破棄伝票（操作ログの作業区分）
--   SELECT * FROM msbunrui WHERE kubun = 'hakikbn' ORDER BY value;    -- 8・9 が既に使われていないか
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

-- ---------------------------------------------------------------------
-- 1. 在庫の列の NULL 対策（展開伝票の teni・teno にも関係する）
--    haki・teni・teno・henp・movi・movo は既定値が無い（または NULL を許す）ため、NULL の行に足し算すると NULL のままになり、
--    在庫が合わなくなる。NULL を 0 にして、既定値を 0 にする（行が多いと少し時間がかかる）
-- ---------------------------------------------------------------------
UPDATE trzaiko SET haki = coalesce(haki, 0), teni = coalesce(teni, 0), teno = coalesce(teno, 0),
                   henp = coalesce(henp, 0), movi = coalesce(movi, 0), movo = coalesce(movo, 0)
 WHERE haki IS NULL OR teni IS NULL OR teno IS NULL OR henp IS NULL OR movi IS NULL OR movo IS NULL;
ALTER TABLE trzaiko ALTER COLUMN haki SET DEFAULT 0;
ALTER TABLE trzaiko ALTER COLUMN teni SET DEFAULT 0;
ALTER TABLE trzaiko ALTER COLUMN teno SET DEFAULT 0;
ALTER TABLE trzaiko ALTER COLUMN henp SET DEFAULT 0;
ALTER TABLE trzaiko ALTER COLUMN movi SET DEFAULT 0;
ALTER TABLE trzaiko ALTER COLUMN movo SET DEFAULT 0;

-- ---------------------------------------------------------------------
-- 2. 採番（在庫調整伝票番号）。無ければ、今ある伝票の最大の番号から始める
-- ---------------------------------------------------------------------
INSERT INTO trnumber (id, type, curnum, memo)
SELECT c.id, 'cdenno', coalesce((SELECT max(t.denno) FROM trchoden t WHERE t.id = c.id), 0), '在庫調整伝票番号'
  FROM (SELECT DISTINCT id FROM trnumber) c
 WHERE NOT EXISTS (SELECT 1 FROM trnumber n WHERE n.id = c.id AND n.type = 'cdenno');

-- ---------------------------------------------------------------------
-- 3. 理由（分類マスタ hakikbn）に、在庫が合わないときの理由を足す（無ければ）
--    8 = 原因不明（増）: 数えたら在庫が多かった、9 = 原因不明（減）: 数えたら在庫が少なかった
-- ---------------------------------------------------------------------
INSERT INTO msbunrui (id, kubun, value, viewval)
SELECT c.id, 'hakikbn', v.value, v.viewval
  FROM (SELECT DISTINCT id FROM msbunrui) c,
       (VALUES ('8', '原因不明（増）'), ('9', '原因不明（減）')) AS v(value, viewval)
 WHERE NOT EXISTS (SELECT 1 FROM msbunrui b WHERE b.id = c.id AND b.kubun = 'hakikbn' AND b.value = v.value);

-- ---------------------------------------------------------------------
-- 4. 操作ログ（tropelog、extype = '11' 破棄伝票）。保存のたびに 1 伝票につき 1 件
--    （画面の保存は 明細の削除 → 登録 なので、登録の文の終わりに 1 行目で記録する。前に記録があれば「調整変更」）
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trchoden_opelog() RETURNS trigger AS $$
DECLARE
  v_memo text;
  v_old boolean;
BEGIN
  IF NEW.line <> (SELECT min(line) FROM trchoden WHERE id = NEW.id AND denno = NEW.denno) THEN
    RETURN NULL;
  END IF;
  SELECT EXISTS (SELECT 1 FROM tropelog WHERE id = NEW.id AND extype = '11' AND keycode = NEW.denno::text) INTO v_old;
  SELECT left(string_agg(gcode || CASE WHEN suu < 0 THEN ' +' || (-suu) ELSE ' -' || suu END
                         || coalesce('(' || chokbn || ')', ''), ', ' ORDER BY line), 900)
    INTO v_memo
    FROM trchoden WHERE id = NEW.id AND denno = NEW.denno;
  INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
  VALUES (NEW.id, NEW.denno::text, NEW.scode, '11',
          CASE WHEN v_old THEN '調整変更' ELSE '調整登録' END || ' 倉庫=' || coalesce(NEW.scode, '') || ' 日付=' || coalesce(NEW.day::text, '')
          || ' ' || coalesce(v_memo, ''),
          coalesce(NEW.updated_by, NEW.created_by));
  RETURN NULL;
END
$$ LANGUAGE plpgsql
SET search_path FROM CURRENT;  -- test の伝票は test.tropelog に書く（実行時の search_path は public のため）

DROP TRIGGER IF EXISTS trchoden_opelog ON trchoden;
CREATE TRIGGER trchoden_opelog
  AFTER INSERT ON trchoden
  FOR EACH ROW EXECUTE FUNCTION trchoden_opelog();

-- ---------------------------------------------------------------------
-- Hasura 側の設定（staff の権限）
--   ・trchoden: select / insert / delete（全部の列）
--   ・trzaiko: update の列に haki（移動・展開と同じく insert の列にも）
-- ---------------------------------------------------------------------
