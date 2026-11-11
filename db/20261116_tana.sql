-- =====================================================================
-- 棚卸（単票・スマホ・一斉棚卸の下書きと一括確定）
--
--   在庫数 = 棚卸テーブル trgtana の、その日より前の一番新しい棚卸数 + その翌日から（その日まで）の入出庫（trzaiko）。
--   棚卸を登録する = trgtana に（倉庫・商品・日付・棚卸数）を入れる。棚卸数はその日の終わりの在庫として扱われる。
--
--   1. （trgtana は 備考 memo・登録者・更新者 の列が既にあるので、列は足さない）
--   2. trtanaent（新規）: 一斉棚卸の下書き。スマホ・単票・CSV で、場所（棚）ごとに数えた数を貯める。
--      棚卸集計の画面で商品ごとに合計し、システム在庫と比べてから一括確定で trgtana に書く
--   3. fn_tanastock（新規）: 倉庫・日付を指定して、商品ごとのシステム在庫（その日の終わり、その日の棚卸の前）を一度に出す
--      （Hasura で関数を使えるように、戻り値の型の空のテーブル tanastock を作る）
--   4. 操作ログ（tropelog、extype = '12' 棚卸伝票。keycode = 商品コード、subkeycd = 倉庫）
--
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する。
--   「Track this」にチェックを入れて実行すると、trtanaent・tanastock・fn_tanastock が Hasura に追加される
--   （入れ忘れたら Data の画面で Track する）。
-- 先に確かめること: SELECT * FROM msbunrui WHERE kubun = 'extype' AND value = '12';   -- 12 = 棚卸伝票
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

-- 2. 一斉棚卸の下書き
CREATE TABLE IF NOT EXISTS trtanaent (
  sequ       bigserial PRIMARY KEY,
  id         smallint NOT NULL,
  scode      text NOT NULL,
  day        date NOT NULL,
  gcode      text NOT NULL,
  loc        text,                         -- 数えた場所（棚1・コンテナ1 など）
  suu        integer NOT NULL,
  memo       text,
  done_at    timestamptz,                  -- 一括確定で trgtana に書いた日時
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text
);
CREATE INDEX IF NOT EXISTS trtanaent_key ON trtanaent (id, scode, day, gcode);
COMMENT ON TABLE trtanaent IS '一斉棚卸の下書き（場所ごとに数えた数。棚卸集計で合計して一括確定）';

-- 3. 倉庫・日付ごとのシステム在庫
CREATE TABLE IF NOT EXISTS tanastock (
  id    smallint,
  scode text,
  gcode text,
  stock integer
);
COMMENT ON TABLE tanastock IS 'fn_tanastock の戻り値の型（データは入れない）';

CREATE OR REPLACE FUNCTION fn_tanastock(p_id smallint, p_scode text, p_day date)
RETURNS SETOF tanastock AS $$
  WITH t AS (
    SELECT DISTINCT ON (gcode) gcode, day, tana
      FROM trgtana
     WHERE id = p_id AND scode = p_scode AND day < p_day
     ORDER BY gcode, day DESC
  ), z AS (
    SELECT z.gcode,
           sum(coalesce(z.hnyu, 0) + coalesce(z.movi, 0) + coalesce(z.teni, 0) + coalesce(z.nyuk, 0)
             - coalesce(z.syuk, 0) - coalesce(z.movo, 0) - coalesce(z.teno, 0) - coalesce(z.haki, 0)) AS n
      FROM trzaiko z
      LEFT JOIN t ON t.gcode = z.gcode
     WHERE z.id = p_id AND z.scode = p_scode AND z.day <= p_day AND z.day > coalesce(t.day, DATE '2000-01-01')
     GROUP BY z.gcode
  )
  SELECT p_id, p_scode, g.gcode, (coalesce(t.tana, 0) + coalesce(z.n, 0))::integer
    FROM (SELECT gcode FROM t UNION SELECT gcode FROM z) g
    LEFT JOIN t ON t.gcode = g.gcode
    LEFT JOIN z ON z.gcode = g.gcode
$$ LANGUAGE sql STABLE
SET search_path FROM CURRENT;

-- 4. 棚卸の操作ログ（登録・上書きのたび）
CREATE OR REPLACE FUNCTION trgtana_opelog() RETURNS trigger AS $$
BEGIN
  INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
  VALUES (NEW.id, NEW.gcode, NEW.scode, '12',
          '棚卸 倉庫=' || coalesce(NEW.scode, '') || ' 日付=' || coalesce(NEW.day::text, '') || ' 数=' || coalesce(NEW.tana::text, '')
          || coalesce(' ' || NEW.memo, ''),
          NEW.updated_by);
  RETURN NULL;
END
$$ LANGUAGE plpgsql
SET search_path FROM CURRENT;

DROP TRIGGER IF EXISTS trgtana_opelog ON trgtana;
CREATE TRIGGER trgtana_opelog
  AFTER INSERT ON trgtana
  FOR EACH ROW EXECUTE FUNCTION trgtana_opelog();

-- ---------------------------------------------------------------------
-- Hasura 側の設定（staff の権限）
--   ・trgtana: select / insert / delete（全部の列。登録は 同じ倉庫・日・商品 を消してから入れる＝上書き）
--   ・trtanaent: Track して select / insert / update / delete（全部の列。行の条件は id で絞らなくてよい）
--   ・tanastock: Track して select（fn_tanastock はこの権限で使える）。fn_tanastock を Track する
-- ---------------------------------------------------------------------
