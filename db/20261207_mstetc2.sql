-- =====================================================================
-- 配送方法マスタ・帳票タイプマスタ・文書マスタのメンテナンス画面
-- （各マスタ → 配送方法マスタ / 帳票タイプマスタ / 文書マスタ、/mstetc/hokuri・/mstetc/buntype・/mstetc/bunsho）
--
-- 表の変更はありません（mshokuri・msbuntype・msbunsho はそのまま使います）。
-- 今は staff に select の権限しか無いので、画面から登録・保存できるように Hasura で権限を足します
-- （担当者・倉庫マスタ〈db/20261206_mstetc.sql〉と同じやり方）。画面に削除は無いので、delete の権限は要りません。
-- =====================================================================

-- ---------------------------------------------------------------------
-- Hasura 側の設定（1 つずつ保存する。続けて保存すると Hasura が落ちることがある）
--   public と test の両方（mshokuri・msbuntype・msbunsho と test_ の付いた 3 つ、合わせて 6 つ）に付ける
--   ・staff の insert：全部の列。Row insert permissions は Without any checks
--   ・staff の update：id と code 以外の全部の列。Pre-update check は Without any checks
--       mshokuri  … name htype hscode csvimp scode binshu mtchaku daibiki cuscode order onmin onmax
--       msbuntype … name first saki second sksec
--       msbunsho  … name title message gakutxt stamp atesaki hmoto
--   ・select はもう付いているので、そのまま
--   ・配送会社の選択肢に mshaisou（test_mshaisou）を読むので、staff の select が付いていること
--
-- 付いたかどうかは、テスト環境の画面で行を選んで、何も変えずに「保存」して確かめる。権限が無いと
-- 「保存できませんでした：… not found in type …」と出ます。
-- ---------------------------------------------------------------------

-- 確認用：今の行の数（会社ごと）
SELECT id, count(*) AS hokuri FROM mshokuri GROUP BY id ORDER BY id;
SELECT id, count(*) AS buntype FROM msbuntype GROUP BY id ORDER BY id;
SELECT id, count(*) AS bunsho FROM msbunsho GROUP BY id ORDER BY id;
