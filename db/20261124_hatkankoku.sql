-- =====================================================================
-- 発注勧告（現行の【原本】YYYY年MM月発注勧告.xlsm の Span マクロが旧システムの DB から読んでいた値）
-- 画面「発注勧告」（/frmkankoku）から使う。在庫と受注残は fzaikosc（db/20261124_chusyutsu.sql）を使う。
--
--   fsyukscm : 期間の出荷数（出荷 syuk だけ。展開出庫は含めない）を 商品 × 倉庫 で
--   fhatzall : 全倉庫の発注残の明細（発注日・倉庫・入荷予定日・発注数・発注残）
--
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する。
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

-- 関数の戻り値の型
CREATE TABLE IF NOT EXISTS thksyuk (
    gcode text
  , scode text
  , suu   numeric
);

-- 期間の出荷数（現行の get_shukka と同じく syuk だけ）
CREATE OR REPLACE FUNCTION fsyukscm(p_id smallint, p_from date, p_to date)
RETURNS SETOF thksyuk AS $$
  SELECT z.gcode::text, z.scode::text, SUM(COALESCE(z.syuk, 0))::numeric
    FROM trzaiko z
   WHERE z.id = p_id AND z.day BETWEEN p_from AND p_to
   GROUP BY z.gcode, z.scode
  HAVING SUM(COALESCE(z.syuk, 0)) <> 0;
$$ LANGUAGE sql STABLE;

-- 関数の戻り値の型
CREATE TABLE IF NOT EXISTS thkhatz (
    denno integer
  , line  integer
  , day   date
  , scode text
  , gcode text
  , yday  date
  , suu   numeric
  , hatzn numeric
);

-- 全倉庫の発注残の明細（発注数 − 仕入数。fhatzan / fhatzmei と同じ計算）。p_from より前の発注は除く
-- day は明細の発注日（無ければ伝票の発注日）。yday は入荷予定日
CREATE OR REPLACE FUNCTION fhatzall(p_id smallint, p_from date)
RETURNS SETOF thkhatz AS $$
  SELECT x.denno, x.line, x.day, x.scode, x.gcode, x.yday, x.suu, x.hatzn
    FROM (
      SELECT h.denno::integer AS denno, h.line::integer AS line,
             COALESCE(h.day::date, d.day::date) AS day, trim(d.scode)::text AS scode, h.gcode::text AS gcode,
             NULLIF(h.yday::text, '')::date AS yday, COALESCE(h.suu, 0)::numeric AS suu,
             (h.suu - COALESCE(a.siire, 0) - COALESCE(a.tsuu, 0))::numeric AS hatzn
        FROM trhatmei h
        JOIN trhatden d ON d.id = h.id AND d.denno = h.denno
        LEFT JOIN (
          SELECT s.hdenno, s.hline, SUM(s.suu) AS siire, SUM(s.tsuu) AS tsuu
            FROM trsiimei s
           WHERE s.id = p_id
           GROUP BY s.hdenno, s.hline
        ) a ON a.hdenno = h.denno AND a.hline = h.line
       WHERE h.id = p_id
    ) x
   WHERE x.hatzn > 0 AND x.day >= p_from;
$$ LANGUAGE sql STABLE;

-- ---------------------------------------------------------------------
-- Hasura 側の設定（test と public の両方）
--   ・Reload metadata
--   ・表 thksyuk, thkhatz を Track する（staff に select 権限。列はすべて、行の条件なし）
--   ・関数 fsyukscm, fhatzall を Track する（Add As Root Field）
--   ・発注伝票の登録は、発注伝票の画面と同じ権限（trhatden / trhatmei の insert、trzaiko の insert / update、trnumber の update）を使う
--
-- 確かめる SQL（test）
--   SELECT * FROM test.fsyukscm(1::smallint, date '2026-02-01', date '2026-02-28') WHERE gcode = 'KM30-BK';
--   SELECT scode, count(*), sum(hatzn) FROM test.fhatzall(1::smallint, date '2019-06-28') GROUP BY scode ORDER BY scode;
-- ---------------------------------------------------------------------
