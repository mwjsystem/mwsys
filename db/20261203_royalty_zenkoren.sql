-- =====================================================================
-- ロイヤリティ（全硬連）: 現行の SQL に合わせて、HGKP3・BPKP は中分類 072 の伝票だけ数える
--
--   HGKP3・BPKP の行の条件 cond に chubunrui:072 を入れる（返品伝票を数えないのはプログラムで決めている）。
--   NGKO・LG48・NG-IKG（全硬連の商品）は中分類で絞らない。
--   BPKP は現行の SQL（gcode LIKE 'BPKP%'）に合わせて、BPKP で始まる商品コードを全部数える。
--   20261201_royalty_add.sql をこれから実行する環境は、初期データに入っているので不要。
--
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する。
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

UPDATE msroyitem SET cond = 'chubunrui:072' WHERE id = 1 AND org = 'zenkoren' AND grp IN ('HGKP3', 'BPKP');
UPDATE msroyitem SET gcodes = 'BPKP*' WHERE id = 1 AND org = 'zenkoren' AND grp = 'BPKP';
