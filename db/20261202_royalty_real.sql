-- =====================================================================
-- ロイヤリティ: 団体「リアル」を足す
--
--   real  リアル  1 年。おちゃのこ（受注区分 9 の Web。楽天を除く）で受注した指定商品（…-RL）の型番ごとの数量
--                 （現行は おちゃのこの CSV をダウンロードして集計していた）
--
--   20261129_royalty.sql（テーブル）を実行したあとに実行する。
--   もう一度実行すると、リアルのマスタは初期データに戻る（ほかの団体はそのまま）。
--
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する。
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

DELETE FROM msroyorg WHERE id = 1 AND org = 'real';
DELETE FROM msroyitem WHERE id = 1 AND org = 'real';
DELETE FROM msroymem WHERE id = 1 AND org = 'real';

INSERT INTO msroyorg (id, org, seq, name, dest, dest2, regno, bank, bank2, tanto, greet) VALUES
  (1, 'real', 140, 'リアル', NULL, NULL, NULL, NULL, NULL, NULL, NULL);

INSERT INTO msroyitem (id, org, grp, seq, name, size, color, gcodes, cond, price, price2, price3, price4, rate, memo) VALUES
  (1, 'real', NULL, 10, 'リアルチャンピオンシップ指定チェストプロテクター', NULL, NULL, 'CP11-*-RL', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (1, 'real', NULL, 20, 'リアルチャンピオンシップ指定ヘッドガード', NULL, NULL, 'HG49-*-RL', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (1, 'real', NULL, 30, 'リアルチャンピオンシップ指定女性用アンダーガード', NULL, NULL, 'GG34-*-RL', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (1, 'real', NULL, 40, 'リアルチャンピオンシップ男性用アンダープロテクター', NULL, NULL, 'GG53-*-RL', NULL, NULL, NULL, NULL, NULL, NULL, NULL);
