-- =====================================================================
-- 旧システムの加工マスタ（msprocess・msprcparts）を消す（新しい加工マスタ mskako・mskakoposi に置き換え）
--
-- 【必ずこの順で】
--   1. アプリ（msprocesses を読まなくした版）を、ステージングと本番の両方に反映する
--      （先に消すと、反映前のアプリの受注伝票で商品・顧客が読めなくなる）
--   2. Hasura コンソールで、次のリレーションを消す（1 つずつ保存する）
--        msggroup → msprocesses、msmember → msprocesses（ほかに msprocess・msprcparts へのリレーションがあればそれも）
--      そのあと msprocess・msprcparts の Track を外す（Untrack）
--   3. Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する
--      （ビューなどが使っていればエラーで止まる。そのときは消さずに知らせてください）
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

DROP TABLE IF EXISTS msprcparts, msprocess;
