-- =====================================================================
-- 決算資料（現行の「YYYYMMDD決算.xlsx」を作るための抽出の置き換え。画面は /repkessan）
--
--   fkessan_uri     : 売上（月別・税率別）。現行の「年間売上取得(2019以降非課税対応).xlsm」と同じ集計
--                     ・伝票ごとに、ヘッダの 商品合計・値引・送料・手数料・消費税 を 10% / 8% / 非課税 に振り分ける
--                     ・明細の区分（商品マスタの gkbn。1 送料 / 2 手数料 / 3 値引 / それ以外 商品）と
--                       税区分（mtax = '2' 非課税 / 税率 8 / それ以外 10%）で明細を合計し、
--                       8%・非課税は明細の合計、10% は残り（ヘッダ − 8% − 非課税）。1 つの区分だけならヘッダの全額
--                     ・消費税は 8% が明細の合計、10% が残り（明細に消費税が無い伝票はヘッダの全額を 10% に入れる。
--                       現行のマクロはこの場合に消費税を落としていた）
--                     ・返品（denku = 2）はマイナス。件数は伝票の数（返品を含む）
--   fkessan_urikake : 都度売掛（期末残）。現行の「決算用売掛金データ抽出」の置き換え
--                     ・売上日が期間内・支払方法が p_pcodes（カンマ区切り）・大分類の名前が「通販」でない受注
--                     ・残高 = 合計 − 期末日までの入金 + 出金 − 調整（vnyuzan と同じ式を、入金日が期末日までの入金伝票で計算）
--                     ・返品（denku = 2）は金額の符号を逆にする（現行と同じ）
--                     ・期末日より後の入金（入金 − 出金 + 調整）と最初の入金日も返す（突き合わせ用）
--   fkessan_zaiko   : 在庫金額。期末日の倉庫別の在庫数（直近の棚卸＋それ以降の増減。fzaikoall と同じ式）と、
--                     期末日時点の原価（msgtanka の期末日以前で最新）。在庫数 > 0 の行だけ返す。円換算は画面で行う
--   入金伝票の手数料は、画面から trnyusub / trnyuden を直接読む（DB の変更なし）
--
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する。
-- 先に db/20261117_nyukin.sql を流しておくこと
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

-- 関数の戻り値の型（Hasura の関数は、Track した表の行を返す必要がある。行は入らない）
CREATE TABLE IF NOT EXISTS tkessan_uri (
    ym  text      -- 'YYYY-MM'
  , kbn smallint  -- 0 = 10%、1 = 8%、2 = 非課税
  , cnt integer   -- 伝票の数（kbn = 0 の行だけ）
  , gtt numeric   -- 商品合計
  , neb numeric   -- 値引額
  , sor numeric   -- 送料
  , tes numeric   -- 手数料
  , tax numeric   -- 消費税
);

CREATE TABLE IF NOT EXISTS tkessan_urikake (
    denno     integer
  , uday      date
  , mcode     text     -- 請求先（無ければ受注先）
  , mname     text
  , pcode     text
  , daibunrui text
  , tcode     text     -- 内勤担当
  , tcode1    text     -- 営業担当
  , total     numeric  -- 売上額
  , nyukin    numeric  -- 期末日までの入金（入金 − 出金）
  , chosei    numeric  -- 期末日までの調整
  , zan       numeric  -- 期末時点残高
  , lastday   date     -- 期末日までの最後の入金日
  , atoday    date     -- 期末日より後の最初の入金日
  , atokin    numeric  -- 期末日より後の入金（入金 − 出金 + 調整）
);

CREATE TABLE IF NOT EXISTS tkessan_zaiko (
    scode    text
  , gcode    text
  , gtext    text
  , zaiko    numeric
  , genka    numeric
  , currency text
  , subcat   text
  , tkbn     text
);

-- 振り分け: ヘッダの金額 h を、明細の合計 a0（10%）・a1（8%）・a2（非課税）で 3 つに分ける（マクロの Set_Sum と同じ順）
CREATE OR REPLACE FUNCTION fkessan_alloc(h numeric, a0 numeric, a1 numeric, a2 numeric)
RETURNS numeric[] AS $$
  SELECT CASE
    WHEN a1 = 0 AND a2 = 0 THEN ARRAY[h, 0, 0]
    WHEN a0 = 0 AND a2 = 0 THEN ARRAY[0, h, 0]
    WHEN a0 = 0 AND a1 = 0 THEN ARRAY[0, 0, h]
    WHEN a1 = 0 THEN ARRAY[h - a2, 0, a2]
    WHEN a0 = 0 THEN ARRAY[0, h - a2, a2]
    WHEN a2 = 0 THEN ARRAY[h - a1, a1, 0]
    ELSE ARRAY[h - a1 - a2, a1, a2]
  END::numeric[]
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION fkessan_uri(p_id smallint, p_from date, p_to date)
RETURNS SETOF tkessan_uri AS $$
  WITH d AS (
    SELECT j.denno, to_char(j.uday, 'YYYY-MM') AS ym, CASE WHEN j.denku = 2 THEN -1 ELSE 1 END AS sgn,
           coalesce(j.gtotalzn, 0) AS hg, coalesce(j.nebikizn, 0) AS hn, coalesce(j.soryozn, 0) AS hs,
           coalesce(j.tesuzn, 0) AS ht, coalesce(j.taxtotal, 0) AS hx
      FROM trjyuden j
     WHERE j.id = p_id AND j.uday BETWEEN p_from AND p_to AND j.del IS NOT TRUE
  ), l AS (
    SELECT t.denno,
           CASE WHEN trim(t.mtax::text) = '2' THEN 2
                WHEN trim(t.taxrate::text) ~ '^8(\.0*)?$' THEN 1
                ELSE 0 END AS k,
           CASE trim(r.gkbn::text)  -- 明細の区分は商品マスタ（msggroup）の gkbn（現行と同じ）
                WHEN '1' THEN 's' WHEN '2' THEN 't' WHEN '3' THEN 'n' ELSE 'g' END AS c,
           coalesce(t.toutmoney, 0) AS m, coalesce(t.taxmoney, 0) AS x
      FROM trjyumei t
      LEFT JOIN msgoods g ON g.id = t.id AND g.gcode = t.gcode
      LEFT JOIN msggroup r ON r.id = g.id AND r.code = g.code
     WHERE t.id = p_id AND t.del IS NOT TRUE AND t.denno IN (SELECT denno FROM d)
  ), s AS (
    SELECT l.denno,
           coalesce(sum(m) FILTER (WHERE c = 'g' AND k = 0), 0) AS g0, coalesce(sum(m) FILTER (WHERE c = 'g' AND k = 1), 0) AS g1,
           coalesce(sum(m) FILTER (WHERE c = 'g' AND k = 2), 0) AS g2,
           coalesce(sum(m) FILTER (WHERE c = 'n' AND k = 0), 0) AS n0, coalesce(sum(m) FILTER (WHERE c = 'n' AND k = 1), 0) AS n1,
           coalesce(sum(m) FILTER (WHERE c = 'n' AND k = 2), 0) AS n2,
           coalesce(sum(m) FILTER (WHERE c = 's' AND k = 0), 0) AS s0, coalesce(sum(m) FILTER (WHERE c = 's' AND k = 1), 0) AS s1,
           coalesce(sum(m) FILTER (WHERE c = 's' AND k = 2), 0) AS s2,
           coalesce(sum(m) FILTER (WHERE c = 't' AND k = 0), 0) AS t0, coalesce(sum(m) FILTER (WHERE c = 't' AND k = 1), 0) AS t1,
           coalesce(sum(m) FILTER (WHERE c = 't' AND k = 2), 0) AS t2,
           coalesce(sum(x) FILTER (WHERE k = 0), 0) AS x0, coalesce(sum(x) FILTER (WHERE k = 1), 0) AS x1
      FROM l
     GROUP BY l.denno
  ), a AS (  -- 明細の無い伝票は数えない（現行と同じ）
    SELECT d.ym, d.sgn,
           fkessan_alloc(d.hg, s.g0, s.g1, s.g2) AS g,
           fkessan_alloc(d.hn, s.n0, s.n1, s.n2) AS n,
           fkessan_alloc(d.hs, s.s0, s.s1, s.s2) AS so,
           fkessan_alloc(d.ht, s.t0, s.t1, s.t2) AS t,
           CASE WHEN s.x0 = 0 AND s.x1 = 0 THEN ARRAY[d.hx, 0, 0]
                WHEN s.x0 = 0 THEN ARRAY[0, d.hx, 0]
                WHEN s.x1 = 0 THEN ARRAY[d.hx, 0, 0]
                ELSE ARRAY[d.hx - s.x1, s.x1, 0] END::numeric[] AS x
      FROM d
      JOIN s ON s.denno = d.denno
  )
  SELECT a.ym, k.k::smallint,
         CASE WHEN k.k = 0 THEN count(*)::integer ELSE 0 END,
         sum(a.sgn * a.g[k.k + 1])::numeric, sum(a.sgn * a.n[k.k + 1])::numeric, sum(a.sgn * a.so[k.k + 1])::numeric,
         sum(a.sgn * a.t[k.k + 1])::numeric, sum(a.sgn * a.x[k.k + 1])::numeric
    FROM a
   CROSS JOIN generate_series(0, 2) AS k(k)
   GROUP BY a.ym, k.k
$$ LANGUAGE sql STABLE
SET search_path FROM CURRENT;

CREATE OR REPLACE FUNCTION fkessan_urikake(p_id smallint, p_from date, p_to date, p_pcodes text)
RETURNS SETOF tkessan_urikake AS $$
  SELECT j.denno::integer, j.uday::date, x.mcode::text,
         trim(coalesce(m.sei, '') || ' ' || coalesce(m.mei, ''))::text,
         trim(j.pcode)::text, trim(j.daibunrui)::text, trim(j.tcode)::text, trim(j.tcode1)::text,
         (x.sgn * coalesce(j.total, 0))::numeric,
         (x.sgn * (coalesce(b.n, 0) - coalesce(b.s, 0)))::numeric,
         (x.sgn * coalesce(b.t, 0))::numeric,
         (x.sgn * (coalesce(j.total, 0) - coalesce(b.n, 0) + coalesce(b.s, 0) - coalesce(b.t, 0)))::numeric,
         b.lastday, a.atoday, (x.sgn * a.atokin)::numeric
    FROM trjyuden j
   CROSS JOIN LATERAL (SELECT coalesce(nullif(trim(j.scde), ''), j.mcode) AS mcode,
                              CASE WHEN j.denku = 2 THEN -1 ELSE 1 END AS sgn) x
    LEFT JOIN msmember m ON m.id = j.id AND m.mcode = x.mcode
    LEFT JOIN LATERAL (
      SELECT sum(n.nmoney) AS n, sum(n.smoney) AS s, sum(n.tmoney) AS t, max(n.day)::date AS lastday
        FROM trnyusub n
       WHERE n.id = j.id AND n.jdenno = j.denno AND n.del IS NOT TRUE AND n.day::date <= p_to
    ) b ON true
    LEFT JOIN LATERAL (
      SELECT min(n.day)::date AS atoday,
             sum(coalesce(n.nmoney, 0) - coalesce(n.smoney, 0) + coalesce(n.tmoney, 0)) AS atokin
        FROM trnyusub n
       WHERE n.id = j.id AND n.jdenno = j.denno AND n.del IS NOT TRUE AND n.day::date > p_to
    ) a ON true
   WHERE j.id = p_id AND j.uday BETWEEN p_from AND p_to AND j.del IS NOT TRUE
     AND trim(j.pcode) = ANY (string_to_array(p_pcodes, ','))
     AND NOT EXISTS (
       SELECT 1 FROM msbunrui u
        WHERE u.id = j.id AND u.kubun = 'daibunrui' AND u.value = trim(j.daibunrui) AND trim(u.viewval) = '通販')
$$ LANGUAGE sql STABLE
SET search_path FROM CURRENT;

-- 在庫: 直近の棚卸＋それ以降の増減（fzaikoall と同じ式。倉庫を絞らない）。原価は期末日以前で最新の単価
CREATE OR REPLACE FUNCTION fkessan_zaiko(p_id smallint, p_day date)
RETURNS SETOF tkessan_zaiko AS $$
  WITH lt AS (
    SELECT DISTINCT ON (t.scode, t.gcode) t.scode, t.gcode, t.day::date AS day, t.tana
      FROM trgtana t
     WHERE t.id = p_id AND t.day <= p_day
     ORDER BY t.scode, t.gcode, t.day DESC
  ), mv AS (
    SELECT z.scode, z.gcode,
           SUM(COALESCE(z.hnyu, 0) + COALESCE(z.nyuk, 0) - COALESCE(z.syuk, 0) + COALESCE(z.movi, 0) - COALESCE(z.movo, 0)
             - COALESCE(z.haki, 0) + COALESCE(z.teni, 0) - COALESCE(z.teno, 0)) AS mov
      FROM trzaiko z
      LEFT JOIN lt l ON l.scode = z.scode AND l.gcode = z.gcode
     WHERE z.id = p_id AND z.day <= p_day AND z.day > COALESCE(l.day, DATE '2000-01-01')
     GROUP BY z.scode, z.gcode
  ), st AS (
    SELECT COALESCE(m.scode, l.scode)::text AS scode, COALESCE(m.gcode, l.gcode)::text AS gcode,
           COALESCE(l.tana, 0) + COALESCE(m.mov, 0) AS zaiko
      FROM mv m
      FULL JOIN lt l ON l.scode = m.scode AND l.gcode = m.gcode
  )
  SELECT trim(st.scode)::text, st.gcode, g.gtext::text, st.zaiko::numeric, k.genka::numeric, k.currency::text, r.subcat::text, g.tkbn::text
    FROM st
    LEFT JOIN msgoods g ON g.id = p_id AND g.gcode = st.gcode
    LEFT JOIN msggroup r ON r.id = g.id AND r.code = g.code
    LEFT JOIN LATERAL (
      SELECT t.genka, t.currency
        FROM msgtanka t
       WHERE t.id = p_id AND t.gcode = st.gcode AND t.day <= p_day
       ORDER BY t.day DESC
       LIMIT 1
    ) k ON true
   WHERE st.zaiko > 0
$$ LANGUAGE sql STABLE
SET search_path FROM CURRENT;

-- ---------------------------------------------------------------------
-- Hasura 側の設定
--   ・Reload metadata
--   ・表 tkessan_uri, tkessan_urikake, tkessan_zaiko を Track し、staff に select 権限（Without any checks・すべての列）を付ける
--   ・関数 fkessan_uri, fkessan_urikake, fkessan_zaiko を Track する（Data > スキーマ > Untracked custom functions。
--     fkessan_alloc は Track しない）
--   ・入金伝票の手数料は trnyusub / trnyuden の select 権限（20261117_nyukin.sql で設定済み）を使う
-- 確認用（すぐ返れば OK。単独で実行するときは既定の public を見るので、スキーマ名を付ける）:
--   SELECT kbn, sum(cnt), sum(gtt), sum(tax) FROM test.fkessan_uri(1::smallint, date '2025-07-01', date '2026-06-30') GROUP BY 1 ORDER BY 1;
--   SELECT count(*), sum(zan) FROM test.fkessan_urikake(1::smallint, date '2025-07-01', date '2026-06-30', '4,5,6,13,15') WHERE zan <> 0;
--   SELECT scode, count(*), sum(zaiko) FROM test.fkessan_zaiko(1::smallint, date '2026-06-30') GROUP BY 1 ORDER BY 1;
-- ---------------------------------------------------------------------
