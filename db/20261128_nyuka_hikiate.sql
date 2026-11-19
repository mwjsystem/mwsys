-- =====================================================================
-- 入荷引当: 入荷（仕入）した数量を、発注入荷待ち（在庫種別 8）の受注明細へ登録の古い順に引き当てる
--
--   アプリ（src/app/services/nyuhik.service.ts）が行う。表・ビューの変更はない。
--   ・入荷日の確定（発注伝票で入荷日を確定にして保存）: 在庫種別 8 のまま、在庫状態詳細に「発注番号_行」を入れて結び付ける
--     （発注残 − もう結び付いている数まで。足りないときは明細を分ける）
--   ・入荷（仕入伝票の保存）: 以下のとおり引き当てる
--   ・同じ商品・同じ倉庫（仕入伝票の倉庫＝受注明細の出荷倉庫）の、未出荷・取消でない受注明細が対象
--   ・受注伝票番号（登録順）・行の順に引き当てる。在庫状態詳細に発注明細（発注番号_行）を手で結び付けた明細は、
--     その発注明細の入荷を先に引き当て、ほかの入荷は引き当てない
--   ・全数: 在庫種別を 1 引当、在庫状態詳細を「仕入<仕入伝票番号>」にする
--   ・一部: 元の行を残りの数量（8 のまま）にし、入荷分の行（1 引当）を伝票の最後に足す。金額も分ける（合計は変わらない）
--   ・受発注の発注明細（jdenno あり）の入荷、セット商品・構成品のある明細は対象外
--   ・仕入伝票の変更は増えた分だけ引き当てる。減っても引き当ては戻さない
--
-- このファイルは確かめる SELECT だけ（実行しても何も変わらない）。
-- =====================================================================
SET search_path TO test;  -- 本番で確かめるときは public に変更

-- 発注入荷待ちの受注明細（商品・倉庫ごと、古い順）
SELECT m.gcode, m.scode, m.denno, m.line, m.suu, m.spdet, j.day
  FROM trjyumei m JOIN trjyuden j ON j.id = m.id AND j.denno = m.denno
 WHERE m.id = 1 AND m.spec = '8' AND NOT j.del AND coalesce(m.del, false) = false
   AND (m.sday IS NULL OR m.sday > current_date)
 ORDER BY m.gcode, m.scode, m.denno, m.line
 LIMIT 200;

-- 入荷引当で引き当てた受注明細
SELECT m.denno, m.line, m.gcode, m.scode, m.suu, m.spec, m.spdet
  FROM trjyumei m
 WHERE m.id = 1 AND m.spdet LIKE '仕入%'
 ORDER BY m.denno, m.line
 LIMIT 200;

-- ---------------------------------------------------------------------
-- Hasura 側の設定（staff の権限。test_trjyumei / trjyumei の両方）
--   ・trjyumei: update の列に suu, spec, spdet, money, tgenka, taxmoney, toutmoney, tinmoney
--     （行の条件は select と同じ。insert はいまの受注伝票の保存で使っている権限のまま）
--   ・vhatzn: select の列に jdenno（発注伝票の一括仕入で使っているので、たぶん設定済み）
-- ---------------------------------------------------------------------
