-- =====================================================================
-- 加工指示: 位置ごとの刺繍の図（画像）
--
--   trkakoposi.img : 刺繍の図（ロゴ・マークの画像。画面で縮めた JPEG の data URL。1 枚 100KB 程度まで）
--                    指示書の道着・帯の図の、その位置に貼る
--
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する。
-- そのあと Hasura の trkakoposi の権限（staff の select / insert / update）に img 列を足す。
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

ALTER TABLE trkakoposi ADD COLUMN IF NOT EXISTS img text;
COMMENT ON COLUMN trkakoposi.img IS '刺繍の図（画像の data URL）';
