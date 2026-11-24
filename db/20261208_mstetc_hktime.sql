-- =====================================================================
-- 配達時間マスタのメンテナンス画面（各マスタ → 配達時間マスタ、/mstetc/hktime）
--
-- 表の変更はありません（mshktime をそのまま使います。主キーは id・hscode・code）。
-- Hasura 側の設定（1 つずつ保存する）
--   ・mshktime と test_mshktime の両方に、staff の insert（全部の列）と update（name bunrui ehiden）を付ける
--     （2026-11-25 時点で public の mshktime には付いていて、test_mshktime にはまだ無い）
-- 画面に削除は無いので、delete の権限は要りません。
-- =====================================================================

SELECT id, hscode, count(*) FROM mshktime GROUP BY id, hscode ORDER BY id, hscode;
