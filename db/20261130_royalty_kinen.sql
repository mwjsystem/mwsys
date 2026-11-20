-- =====================================================================
-- ロイヤリティ（新極真会）: 記念道着の商品コードを、マスタの条件で決めるようにする
--
--   区分 kdcb の記念道着の行（ZZSK110 生成り / ZZSK120 晒）の条件 cond に
--     like:数える商品コード,… ; nodetail:日別の明細に出さない商品コード,…
--   を書く。第14回（KD15）に加えて、第1回（KD13）も数える。
--   （20261129_royalty.sql をこれから実行する環境は、初期データに入っているので不要）
--
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する。
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

UPDATE msroyitem SET cond = 'like:KD15*K,KD13*K;nodetail:KD15*S-K,KD13*S-K'
 WHERE id = 1 AND org = 'shinkyoku' AND grp = 'kdcb' AND gcodes = 'ZZSK110';
UPDATE msroyitem SET cond = 'like:KD15*,KD13*;nodetail:KD15*-S,KD13*-S'
 WHERE id = 1 AND org = 'shinkyoku' AND grp = 'kdcb' AND gcodes = 'ZZSK120';
