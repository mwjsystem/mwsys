-- =====================================================================
-- ロイヤリティ（新極真会）: 記念道着の商品コードを、マスタの条件で決めるようにする
--
--   区分 kdcb の記念道着の行（ZZSK110 生成り / ZZSK120 晒）の条件 cond に
--     like:数える商品コード,… ; nodetail:日別の明細に出さない商品コード,…
--   を書く。第14回世界大会（KD15）に加えて、新極真会記念道着（KD14 晒 / KD14-K 生成り。2025年）も数える。
--   （最初の版は KD13 と書いていたが、KD13 は第13回世界大会の道衣だったので KD14 に直した。
--     もう一度実行すれば直る）
--   20261129_royalty.sql をこれから実行する環境は、初期データに入っているので不要。
--
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する。
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

UPDATE msroyitem SET cond = 'like:KD15*K,KD14*K;nodetail:KD15*S-K,KD14*S-K'
 WHERE id = 1 AND org = 'shinkyoku' AND grp = 'kdcb' AND gcodes = 'ZZSK110';
UPDATE msroyitem SET cond = 'like:KD15*,KD14*;nodetail:KD15*-S,KD14*-S'
 WHERE id = 1 AND org = 'shinkyoku' AND grp = 'kdcb' AND gcodes = 'ZZSK120';
