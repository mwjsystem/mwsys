-- =====================================================================
-- 為替レート（外貨 → 円）を日付つきで持つ（msrate）
--
--   ・社内で決めるレート（市場の日々のレートではない）。決めたとき（年に 1 回程度）に手で 1 行足す
--   ・1 行 = 会社・通貨・適用開始日ごとのレート（1 外貨 = rate 円）。その日から次の行の前日まで使う
--   ・ある日のレートは frate(会社, 通貨, 日付) で読む（その日以前で一番新しい行。無ければ NULL）
--   ・円（JPY）は 1
--   ・今までの 1 つだけのレート（mssystem.currate）を、適用開始日 2000-01-01 の行として入れておく
--     （本当のレートの履歴は画面か SQL で足す。下の「レートを足す」）
--
-- 使うところ
--   ・データ移行: 受注明細の原価が USD の商品は、受注日のレートで円にする（db/migration/02_after_load.sql）
--     これまでは現行の抽出 SQL で 110 倍の固定にしていた
--   ・受注入力: 商品を入れたときの原価（外貨の単価）を、受注日のレートで円にする（行が無ければ mssystem.currate）
--   ・決算資料（/repkessan）: ドル円レートの初期値を、期末日のレートにする（手で変えてもよい）
--   ・為替レートマスタ（各マスタ → 為替レートマスタ、/mstetc/rate）で登録・修正する
--
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する（何度流してもよい）
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

CREATE TABLE IF NOT EXISTS msrate (
    id         smallint      NOT NULL                -- 会社
  , currency   varchar(3)    NOT NULL                -- 通貨（USD など）
  , day        date          NOT NULL                -- 適用開始日
  , rate       numeric(12,4) NOT NULL CHECK (rate > 0)  -- 1 外貨 = rate 円
  , memo       text
  , created_at timestamptz   DEFAULT now()
  , created_by text
  , updated_at timestamptz   DEFAULT now()
  , updated_by text
  , PRIMARY KEY (id, currency, day)
);
COMMENT ON TABLE  msrate          IS '為替レート（外貨 → 円）。適用開始日ごと。ある日のレートはその日以前で一番新しい行（frate）';
COMMENT ON COLUMN msrate.currency IS '通貨（USD など。JPY は入れない）';
COMMENT ON COLUMN msrate.day      IS '適用開始日（この日から次の行の前日まで）';
COMMENT ON COLUMN msrate.rate     IS '1 外貨 = rate 円';

-- ある日のレート（JPY・NULL は 1。行が無ければ NULL）
CREATE OR REPLACE FUNCTION frate(p_id smallint, p_currency text, p_day date)
RETURNS numeric AS $$
  SELECT CASE WHEN coalesce(nullif(trim(p_currency), ''), 'JPY') = 'JPY' THEN 1::numeric
              ELSE (SELECT r.rate FROM msrate r
                     WHERE r.id = p_id AND r.currency = trim(p_currency) AND r.day <= coalesce(p_day, current_date)
                     ORDER BY r.day DESC LIMIT 1) END
$$ LANGUAGE sql STABLE
SET search_path FROM CURRENT;

-- 今までのレート（mssystem.currate）を最初の行として入れる（既にあれば何もしない）
INSERT INTO msrate (id, currency, day, rate, memo, created_by, updated_by)
SELECT s.id, 'USD', DATE '2000-01-01', s.currate, 'mssystem.currate から', 'migration', 'migration'
  FROM mssystem s
 WHERE s.currate > 0
ON CONFLICT (id, currency, day) DO NOTHING;

SELECT id, currency, day, rate, memo FROM msrate ORDER BY id, currency, day;

-- ---------------------------------------------------------------------
-- レートを足す（例: 2024-04-01 から 1 ドル 150 円）
--   INSERT INTO msrate (id, currency, day, rate, created_by, updated_by) VALUES (1, 'USD', '2024-04-01', 150, 'admin', 'admin')
--   ON CONFLICT (id, currency, day) DO UPDATE SET rate = EXCLUDED.rate, updated_at = now(), updated_by = EXCLUDED.updated_by;
--   会社ごとに持つので、東海堂（id 2）にも同じ行を入れる
-- 確認: SELECT frate(1::smallint, 'USD', date '2024-05-01');
--
-- Hasura 側の設定（public の msrate と test_msrate の両方。1 つずつ保存する）
--   ・Reload metadata、表 msrate を Track する
--   ・staff に select（Without any checks・すべての列）、insert（すべての列）、update（rate memo）を付ける
--   画面に削除は無いので、delete の権限は要りません。
-- ---------------------------------------------------------------------
