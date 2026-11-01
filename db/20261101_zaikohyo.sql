-- =====================================================================
-- 在庫表（現行の「★MW在庫表.xlsm」の置き換え。Python のバッチ batch/zaiko から使う）
--
--   msgoods.zaikohyo ほか : 在庫表の対象フラグと、在庫表だけで使う項目
--   mszaikoex             : 「除外品」シートの置き換え（msgoods に無いコードも入るので別テーブル）
--   fzaikoall             : 全商品の在庫と受注残を倉庫別に返す
--
--   行のデータは別ファイルの 20261101_zaikohyo_data_*.sql で入れる。
--
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する。
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

ALTER TABLE msgoods ADD COLUMN IF NOT EXISTS zaikohyo  boolean NOT NULL DEFAULT false;
ALTER TABLE msgoods ADD COLUMN IF NOT EXISTS zh_sort   integer;
ALTER TABLE msgoods ADD COLUMN IF NOT EXISTS zh_fixed  text;
ALTER TABLE msgoods ADD COLUMN IF NOT EXISTS zh_kbn    text;
ALTER TABLE msgoods ADD COLUMN IF NOT EXISTS zh_addsc  text;
ALTER TABLE msgoods ADD COLUMN IF NOT EXISTS zh_addg   text;
ALTER TABLE msgoods ADD COLUMN IF NOT EXISTS zh_sku    text;
ALTER TABLE msgoods ADD COLUMN IF NOT EXISTS zh_jan    text;
ALTER TABLE msgoods ADD COLUMN IF NOT EXISTS zh_name   text;
ALTER TABLE msgoods ADD COLUMN IF NOT EXISTS zh_color  text;
ALTER TABLE msgoods ADD COLUMN IF NOT EXISTS zh_size   text;
ALTER TABLE msgoods ADD COLUMN IF NOT EXISTS zh_send   text;
ALTER TABLE msgoods ADD COLUMN IF NOT EXISTS zh_note   text;
COMMENT ON COLUMN msgoods.zaikohyo IS '在庫表の対象';
COMMENT ON COLUMN msgoods.zh_sort IS '在庫表の並び順';
COMMENT ON COLUMN msgoods.zh_fixed IS '在庫数の固定表示（○ または 廃盤）。空なら計算する';
COMMENT ON COLUMN msgoods.zh_kbn IS '在庫表の区分（セット：内訳の最小値、SB：内訳の最小値、廃番：なくなり次第廃番）';
COMMENT ON COLUMN msgoods.zh_addsc IS '在庫に加算する倉庫';
COMMENT ON COLUMN msgoods.zh_addg IS '在庫に加算する商品コード';
COMMENT ON COLUMN msgoods.zh_sku IS '在庫表の SKU';
COMMENT ON COLUMN msgoods.zh_jan IS '在庫表の JAN コード';
COMMENT ON COLUMN msgoods.zh_name IS '在庫表の商品名';
COMMENT ON COLUMN msgoods.zh_color IS '在庫表のカラー';
COMMENT ON COLUMN msgoods.zh_size IS '在庫表の size/oz';
COMMENT ON COLUMN msgoods.zh_send IS '在庫表の送料区分';
COMMENT ON COLUMN msgoods.zh_note IS '在庫表の納期の説明';

CREATE TABLE IF NOT EXISTS mszaikoex (
    id    smallint NOT NULL
  , kbn   text     NOT NULL
  , gcode text     NOT NULL
  , PRIMARY KEY (id, kbn, gcode)
);
COMMENT ON TABLE mszaikoex IS '在庫連携の除外品';
COMMENT ON COLUMN mszaikoex.kbn IS 'except：エラー通知の対象外・バリエーションの販売停止、bara：道着の上下バラ、haiban：入荷予定を廃番と表示';

-- 関数の戻り値の型（Hasura の関数は、Track した表の行を返す必要がある。行は入らない）
CREATE TABLE IF NOT EXISTS tzaikoall (
    scode text
  , gcode text
  , zaiko numeric
  , juzan numeric
);

-- 在庫：直近の棚卸＋それ以降の増減（マイナスは 0）。受注残：今日まで、全期間のうち大きい方（マクロと同じ）
CREATE OR REPLACE FUNCTION fzaikoall(p_id smallint, p_day date)
RETURNS SETOF tzaikoall AS $$
  WITH lt AS (
    SELECT DISTINCT ON (t.scode, t.gcode) t.scode, t.gcode, t.day::date AS day, t.tana
      FROM trgtana t
     WHERE t.id = p_id AND t.scode IN ('01', '015', '009', '016') AND t.day <= p_day
     ORDER BY t.scode, t.gcode, t.day DESC
  ), mv AS (
    SELECT z.scode, z.gcode,
           SUM(COALESCE(z.hnyu, 0) + COALESCE(z.nyuk, 0) - COALESCE(z.syuk, 0) + COALESCE(z.movi, 0) - COALESCE(z.movo, 0)
             - COALESCE(z.haki, 0) + COALESCE(z.teni, 0) - COALESCE(z.teno, 0))
             FILTER (WHERE z.day <= p_day AND z.day > COALESCE(l.day, DATE '2000-01-01')) AS mov,
           SUM(COALESCE(z.jyut, 0) - COALESCE(z.syuk, 0)) FILTER (WHERE z.day <= p_day) AS zan1,
           SUM(COALESCE(z.jyut, 0) - COALESCE(z.syuk, 0)) AS zan2
      FROM trzaiko z
      LEFT JOIN lt l ON l.scode = z.scode AND l.gcode = z.gcode
     WHERE z.id = p_id AND z.scode IN ('01', '015', '009', '016')
     GROUP BY z.scode, z.gcode
  )
  SELECT COALESCE(m.scode, l.scode)::text, COALESCE(m.gcode, l.gcode)::text,
         GREATEST(COALESCE(l.tana, 0) + COALESCE(m.mov, 0), 0)::numeric,
         GREATEST(COALESCE(m.zan1, 0), COALESCE(m.zan2, 0))::numeric
    FROM mv m
    FULL JOIN lt l ON l.scode = m.scode AND l.gcode = m.gcode;
$$ LANGUAGE sql STABLE;

-- ---------------------------------------------------------------------
-- Hasura 側の設定
--   ・Reload metadata
--   ・表 mszaikoex, tzaikoall を Track する
--   ・関数 fzaikoall を Track する（Add As Root Field）
--   ・バッチは admin secret で接続するので、権限の設定は不要
-- ---------------------------------------------------------------------
