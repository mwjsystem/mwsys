-- =====================================================================
-- 抽出（現行の 国内発注在庫.xlsm・残少在庫確認.xlsm・大会倉庫.xlsm・竹島さん売上.xlsm の置き換え）
-- バッチ batch/zaiko/reportjob.py と、画面「在庫・発注チェック」（/repcheck）から使う。
--
--   fzaikosc  : 指定した倉庫の在庫と受注残（fzaikoall と同じ計算で、倉庫を引数で選ぶ）
--   fsyukmon  : 商品の月別の出荷数（出荷＋展開出庫。倉庫を空にすると全倉庫）
--   fhatzmei  : 倉庫の発注残の明細（発注伝票番号・発注日・仕入先・担当つき）
--   fsyukday  : その日に出荷した商品（倉庫別）
--   fsalesdet : 営業担当の売上明細（返品はマイナス）
--
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する。
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

-- 在庫：直近の棚卸＋それ以降の増減（マイナスは 0）。受注残：今日まで、全期間のうち大きい方（fzaikoall と同じ）
-- p_scodes はカンマ区切り（例 '501,502'）。戻り値の型は fzaikoall と同じ tzaikoall
CREATE OR REPLACE FUNCTION fzaikosc(p_id smallint, p_day date, p_scodes text)
RETURNS SETOF tzaikoall AS $$
  WITH sc AS (
    SELECT trim(x) AS scode FROM unnest(string_to_array(p_scodes, ',')) x
  ), lt AS (
    SELECT DISTINCT ON (t.scode, t.gcode) t.scode, t.gcode, t.day::date AS day, t.tana
      FROM trgtana t
     WHERE t.id = p_id AND t.scode IN (SELECT scode FROM sc) AND t.day <= p_day
     ORDER BY t.scode, t.gcode, t.day DESC
  ), mv AS (
    SELECT z.scode, z.gcode,
           SUM(COALESCE(z.hnyu, 0) + COALESCE(z.nyuk, 0) - COALESCE(z.syuk, 0) + COALESCE(z.movi, 0) - COALESCE(z.movo, 0)
             - COALESCE(z.haki, 0) + COALESCE(z.teni, 0) - COALESCE(z.teno, 0))
             FILTER (WHERE z.day <= p_day AND z.day > COALESCE(l.day, DATE '2000-01-01')) AS mov,
           SUM(COALESCE(z.jyut, 0) - COALESCE(z.syuk, 0)) FILTER (WHERE z.day <= p_day) AS zan1,
           SUM(COALESCE(z.jyut, 0) - COALESCE(z.syuk, 0)) AS zan2
      FROM trzaiko z
      LEFT JOIN lt l ON l.scode = z.scode AND l.gcode = z.gcode
     WHERE z.id = p_id AND z.scode IN (SELECT scode FROM sc)
     GROUP BY z.scode, z.gcode
  )
  SELECT COALESCE(m.scode, l.scode)::text, COALESCE(m.gcode, l.gcode)::text,
         GREATEST(COALESCE(l.tana, 0) + COALESCE(m.mov, 0), 0)::numeric,
         GREATEST(COALESCE(m.zan1, 0), COALESCE(m.zan2, 0))::numeric
    FROM mv m
    FULL JOIN lt l ON l.scode = m.scode AND l.gcode = m.gcode;
$$ LANGUAGE sql STABLE;

-- 関数の戻り値の型
CREATE TABLE IF NOT EXISTS tsyukmon (
    gcode text
  , ym    text
  , suu   numeric
);

-- 月別の出荷数（出荷 syuk ＋ 展開出庫 teno。現行の国内発注在庫と同じ）。p_scode が空なら全倉庫
CREATE OR REPLACE FUNCTION fsyukmon(p_id smallint, p_from date, p_to date, p_scode text)
RETURNS SETOF tsyukmon AS $$
  SELECT z.gcode::text, to_char(z.day, 'YYYYMM'),
         SUM(COALESCE(z.syuk, 0) + COALESCE(z.teno, 0))::numeric
    FROM trzaiko z
   WHERE z.id = p_id AND z.day BETWEEN p_from AND p_to
     AND (coalesce(p_scode, '') = '' OR z.scode = p_scode)
   GROUP BY z.gcode, to_char(z.day, 'YYYYMM')
  HAVING SUM(COALESCE(z.syuk, 0) + COALESCE(z.teno, 0)) <> 0;
$$ LANGUAGE sql STABLE;

-- その日に出荷した商品（在庫の動き trzaiko の出荷数 syuk）。suu は出荷数の合計、ym は使わない
-- （受注明細の出荷日で探すと索引が使えず、時間切れになるため）
CREATE OR REPLACE FUNCTION fsyukday(p_id smallint, p_day date, p_scode text)
RETURNS SETOF tsyukmon AS $$
  SELECT z.gcode::text, to_char(p_day, 'YYYYMMDD'), SUM(COALESCE(z.syuk, 0))::numeric
    FROM trzaiko z
   WHERE z.id = p_id AND z.day = p_day AND z.scode = p_scode
   GROUP BY z.gcode
  HAVING SUM(COALESCE(z.syuk, 0)) > 0;
$$ LANGUAGE sql STABLE;

-- 関数の戻り値の型
CREATE TABLE IF NOT EXISTS thatzmei (
    denno integer
  , line  integer
  , day   date
  , gcode text
  , vcode text
  , tcode text
  , tname text
  , yday  date
  , hatzn numeric
);

-- 倉庫の発注残の明細（発注数 − 仕入数。fhatzan と同じ計算。trhatden に取消の列は無い）
CREATE OR REPLACE FUNCTION fhatzmei(p_id smallint, p_scode text)
RETURNS SETOF thatzmei AS $$
  SELECT x.denno, x.line, x.day, x.gcode, x.vcode, x.tcode, x.tname, x.yday, x.hatzn
    FROM (
      SELECT h.denno::integer AS denno, h.line::integer AS line, d.day::date AS day, h.gcode::text AS gcode,
             trim(d.vcode)::text AS vcode, trim(d.tcode::text) AS tcode,
             (SELECT s.sei FROM msstaff s WHERE s.id = d.id AND s.code = d.tcode LIMIT 1)::text AS tname,
             COALESCE(NULLIF(h.yday::text, ''), NULLIF(h.inday::text, ''))::date AS yday,
             (h.suu - COALESCE(a.siire, 0) - COALESCE(a.tsuu, 0))::numeric AS hatzn
        FROM trhatmei h
        JOIN trhatden d ON d.id = h.id AND d.denno = h.denno
        LEFT JOIN (
          SELECT s.hdenno, s.hline, SUM(s.suu) AS siire, SUM(s.tsuu) AS tsuu
            FROM trsiimei s
           WHERE s.id = p_id
           GROUP BY s.hdenno, s.hline
        ) a ON a.hdenno = h.denno AND a.hline = h.line
       WHERE h.id = p_id AND d.scode = p_scode
    ) x
   WHERE x.hatzn > 0;
$$ LANGUAGE sql STABLE;

-- 関数の戻り値の型
CREATE TABLE IF NOT EXISTS tsalesdet (
    mcode     text
  , mname     text
  , daibunrui text
  , chubunrui text
  , tcode1    text
  , denku     smallint
  , denno     integer
  , uday      date
  , gcode     text
  , gtext     text
  , suu       numeric
  , tanka     numeric
  , kingaku   numeric
  , mmemo     text
);

-- 営業担当（受注伝票の営業担当 tcode1）の売上明細。返品は数量・金額をマイナスにする
CREATE OR REPLACE FUNCTION fsalesdet(p_id smallint, p_from date, p_to date, p_tcode1 text)
RETURNS SETOF tsalesdet AS $$
  SELECT d.mcode::text,
         trim(coalesce(b.sei, '') || ' ' || coalesce(b.mei, ''))::text,
         (SELECT l.viewval FROM msbunrui l WHERE l.id = b.id AND l.kubun = 'daibunrui' AND l.value = b.daibunrui LIMIT 1)::text,
         (SELECT l.viewval FROM msbunrui l WHERE l.id = b.id AND l.kubun = 'chubunrui' AND l.value = b.chubunrui LIMIT 1)::text,
         trim(d.tcode1::text)::text,
         d.denku::smallint, d.denno::integer, d.uday::date, trim(m.gcode)::text, m.gtext::text,
         (CASE WHEN d.denku = 2 THEN -1 ELSE 1 END * coalesce(m.suu, 0))::numeric,
         coalesce(m.tanka, 0)::numeric,
         (CASE WHEN d.denku = 2 THEN -1 ELSE 1 END * coalesce(m.toutmoney, 0))::numeric,
         m.mmemo::text
    FROM trjyuden d
    JOIN trjyumei m ON m.id = d.id AND m.denno = d.denno AND m.del IS NOT TRUE
    LEFT JOIN msmember b ON b.id = d.id AND b.mcode = d.mcode
   WHERE d.id = p_id AND d.uday BETWEEN p_from AND p_to AND d.del IS NOT TRUE
     AND trim(d.tcode1::text) = trim(p_tcode1);
$$ LANGUAGE sql STABLE;

-- ---------------------------------------------------------------------
-- Hasura 側の設定
--   ・Reload metadata
--   ・表 tsyukmon, thatzmei, tsalesdet を Track する（staff に select 権限。列はすべて、行の条件なし）
--     （tzaikoall は Track 済み。staff の select 権限が無ければ付ける）
--   ・関数 fzaikosc, fsyukmon, fsyukday, fhatzmei, fsalesdet を Track する（Add As Root Field）
--   ・バッチは admin secret で接続するので、権限の設定は不要
--
-- 確かめる SQL（test）
--   SELECT * FROM test.fzaikosc(1::smallint, current_date, '501,502') WHERE zaiko > 0 LIMIT 20;
--   SELECT * FROM test.fsyukmon(1::smallint, date '2025-11-01', date '2026-10-31', '') WHERE gcode = 'KM30-BK';
--   SELECT * FROM test.fsyukday(1::smallint, current_date - 1, '01') LIMIT 20;
--   SELECT * FROM test.fhatzmei(1::smallint, '01') WHERE vcode = '000009' ORDER BY denno;
--   SELECT count(*), sum(kingaku) FROM test.fsalesdet(1::smallint, date '2025-11-01', date '2026-10-31', '3107');
-- ---------------------------------------------------------------------
