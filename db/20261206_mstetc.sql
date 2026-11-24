-- =====================================================================
-- 担当者マスタ・倉庫マスタのメンテナンス画面（各マスタ → 担当者マスタ / 倉庫マスタ、/mstetc/staff・/mstetc/store）
--
-- 表の変更はありません（msstaff・msstore はそのまま使います）。
-- 今は staff に select の権限しか無いので、画面から登録・保存できるように Hasura で権限を足します。
-- 行は消さずに del（退職・削除）を付けるので、delete の権限は要りません。
-- =====================================================================

-- ---------------------------------------------------------------------
-- Hasura 側の設定（1 つずつ保存する。続けて保存すると Hasura が落ちることがある）
--   public と test の両方（msstaff・msstore・test_msstaff・test_msstore の 4 つ）に付ける
--   ・staff の insert：全部の列。Row insert permissions は Without any checks
--   ・staff の update：id と code 以外の全部の列。Pre-update check は Without any checks
--       msstaff … sei mei mail scode sort del
--       msstore … name subname zip region local street extend tel tel2 tel3 fax hcode days memo shfolder sort del
--   ・select はもう付いているので、そのまま（全部の列が見えていること）
--
-- 付いたかどうかは、画面で「新規」→ 保存して確かめる。権限が無いと
-- 「保存できませんでした：… not found in type …」と出ます。
-- ---------------------------------------------------------------------

-- 確認用：今の行の数（会社ごと）
SELECT id, count(*) AS staff, count(*) FILTER (WHERE del) AS taishoku FROM msstaff GROUP BY id ORDER BY id;
SELECT id, count(*) AS store, count(*) FILTER (WHERE del) AS sakujo FROM msstore GROUP BY id ORDER BY id;
