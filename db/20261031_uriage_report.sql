-- =====================================================================
-- 売上報告（現行の「2026年売上報告.xlsm」の置き換え）
--
--   マスタ
--     msuritanto   : 集計する担当者（Excel の Mst シート）。ここに無い担当者は「他」にまとめる
--     msurimoku    : 年間目標（実績と目標シート。tcode が空は「他」）
--     msuriminashi : みなし原価（売上に率を掛けて原価にする商品）
--     msuripers    : 個人集計の項目（個人集計シート）
--   集計の関数（Hasura で Track して画面から呼ぶ）
--     furiage      : 月・担当・大分類・部門ごとの売上（税抜）と粗利
--                    p_master = false 実績: 伝票の担当・大分類・部門で集計（SQL1）
--                    p_master = true  昨年: 顧客マスタの担当・大分類・部門で集計（SQL0。大会の顧客は伝票のまま）
--     furiage_ym   : 月ごとの売上の合計（年別の実績の表）
--     furiage_pers : 個人集計の項目ごと・月ごとの金額
--
--   担当・大分類・部門の判定（Module1 の makeMonth と同じ順）
--     媒体 52 → 施工 / Web（媒体管理・部門コード）→ 固定の担当・部門 / 大会の顧客 → 伝票の担当 /
--     それ以外 → 顧客（または伝票）の担当。msuritanto に無ければ「他」
--
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する。
--           索引の作成に少し時間がかかる（本番で数十秒）。
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

-- 媒体・媒体管理（現行の jyusub.bcode / bkcode）
ALTER TABLE trjyuden ADD COLUMN IF NOT EXISTS bcode text;
ALTER TABLE trjyuden ADD COLUMN IF NOT EXISTS bkcode text;
COMMENT ON COLUMN trjyuden.bcode IS '媒体（52 = 施工）';
COMMENT ON COLUMN trjyuden.bkcode IS '媒体管理（01 MW Web / 02 楽天SS / 07 楽天FS / 08 ALMAWeb / 09 NiceGuyWeb / 10 NAS会員Web / 11 ANA MALL）';

CREATE INDEX IF NOT EXISTS trjyuden_uday_idx ON trjyuden (id, uday);

CREATE TABLE IF NOT EXISTS msuritanto (
    id    smallint NOT NULL
  , tcode text     NOT NULL
  , name  text     NOT NULL
  , PRIMARY KEY (id, tcode)
);
COMMENT ON TABLE msuritanto IS '売上報告で集計する担当者（無い担当者は「他」）';

CREATE TABLE IF NOT EXISTS msurimoku (
    id     smallint NOT NULL
  , nendo  smallint NOT NULL
  , tcode  text     NOT NULL
  , target numeric  NOT NULL
  , PRIMARY KEY (id, nendo, tcode)
);
COMMENT ON TABLE msurimoku IS '売上報告の年間目標（tcode が空は「他」）';

CREATE TABLE IF NOT EXISTS msuriminashi (
    id    smallint NOT NULL
  , gcode text     NOT NULL
  , rate  numeric  NOT NULL
  , PRIMARY KEY (id, gcode)
);
COMMENT ON TABLE msuriminashi IS '売上報告のみなし原価（売上 × rate を原価とする商品）';

CREATE TABLE IF NOT EXISTS msuripers (
    id    smallint NOT NULL
  , seq   integer  NOT NULL
  , tanto text     NOT NULL
  , item  text     NOT NULL
  , kind  text     NOT NULL
  , val   text
  , PRIMARY KEY (id, seq)
);
COMMENT ON TABLE msuripers IS '個人集計の項目。kind: M 顧客コード（カンマ区切り）/ B 媒体管理 / F 初回売上顧客（val は担当者）/ G 商品（val は「msggroup の列:値」。列は tcode / category / genre / subcat）';

INSERT INTO msuritanto (id, tcode, name) VALUES
  (1, '310', '佐藤'), (1, '3014', '中尾'), (1, '3017', '栗田'), (1, '3065', '早稲田'), (1, '3080', '多胡'),
  (1, '3106', '福田'), (1, '3107', '竹島'), (1, '3108', '久保田'), (1, '3110', '齋田'), (1, '3113', '佐藤拳'),
  (1, '3114', '江崎'), (1, '3116', '樋口'), (1, '3117', '小島'), (1, '3133', '梅田'), (1, '3138', '東京新人'),
  (1, '3140', '井上啓')
ON CONFLICT DO NOTHING;

INSERT INTO msurimoku (id, nendo, tcode, target) VALUES
  (1, 2026, '3017', 81860000), (1, 2026, '3065', 106495376), (1, 2026, '3106', 107850000), (1, 2026, '3107', 37200000),
  (1, 2026, '3138', 47000000), (1, 2026, '3108', 62887289), (1, 2026, '310', 19700000), (1, 2026, '3110', 103350000),
  (1, 2026, '3113', 31400000), (1, 2026, '3114', 54126000), (1, 2026, '3116', 108488493), (1, 2026, '3117', 101400000),
  (1, 2026, '3140', 10000000), (1, 2026, '3133', 2800000), (1, 2026, '', 87773702)
ON CONFLICT DO NOTHING;

INSERT INTO msuriminashi (id, gcode, rate) VALUES
  (1, 'BRONZE', 0.40), (1, 'MALL', 0.50), (1, 'OEM-A', 0.05), (1, 'OEM-B', 0.10), (1, 'OEM-C', 0.15), (1, 'OEM-D', 0.20),
  (1, 'OEM-E', 0.25), (1, 'OEM-F', 0.30), (1, 'OEM-G', 0.35), (1, 'OEM-H', 0.40), (1, 'OEM-I', 0.45), (1, 'OEM-J', 0.50),
  (1, 'OEM-K', 0.55), (1, 'OEM-L', 0.60), (1, 'OEM-M', 0.65), (1, 'OEM-N', 0.70), (1, 'OEM-O', 0.75), (1, 'OEM-P', 0.80),
  (1, 'OEM-S', 0), (1, 'PRINT', 0.50), (1, 'Z02', 1), (1, 'Z04', 1), (1, 'Z05', 0.50), (1, 'Z08', 0.80), (1, 'Z11', 0.50),
  (1, 'Z12', 0.50)
ON CONFLICT DO NOTHING;

INSERT INTO msuripers (id, seq, tanto, item, kind, val) VALUES
  (1, 10, '江崎', '柔術大会主催', 'M', '410603'),
  (1, 20, '江崎', 'ALMA商品', 'G', 'tcode:3334'),
  (1, 30, '江崎', 'ALMA WEB', 'B', '08'),
  (1, 40, '江崎', '初回売上顧客', 'F', '3114'),
  (1, 50, '小島', 'FEMININE WORKS', 'M', '410569,410618'),
  (1, 60, '小島', 'LEM', 'G', 'category:1605'),
  (1, 70, '小島', '初回売上顧客', 'F', '3117'),
  (1, 80, '福田', '初回売上顧客', 'F', '3106'),
  (1, 90, '久保田', '初回売上顧客', 'F', '3108'),
  (1, 100, '竹島', 'ラグビー関連', 'G', 'category:199'),
  (1, 110, '竹島', '初回売上顧客', 'F', '3107'),
  (1, 120, '樋口', '初回売上顧客', 'F', '3116'),
  (1, 130, '早稲田', '初回売上顧客', 'F', '3065'),
  (1, 140, '齋田', '初回売上顧客', 'F', '3110')
ON CONFLICT (id, seq) DO UPDATE SET kind = EXCLUDED.kind, val = EXCLUDED.val;

-- 関数の戻り値の型（Hasura の関数は、Track した表の行を返す必要がある。行は入らない）
CREATE TABLE IF NOT EXISTS tsuriage (ym text, tanto text, tname text, daibunrui text, bumon text, uriage numeric, arari numeric);
CREATE TABLE IF NOT EXISTS tsuriage_ym (ym text, uriage numeric);
CREATE TABLE IF NOT EXISTS tsuriage_pers (seq integer, ym text, kingaku numeric);

CREATE OR REPLACE FUNCTION furiage(p_id smallint, p_from date, p_to date, p_master boolean)
RETURNS SETOF tsuriage AS $$
  WITH d AS (
    SELECT j.denno, to_char(j.uday, 'YYYY-MM') AS ym, CASE WHEN j.denku = 2 THEN -1 ELSE 1 END AS sgn,
           j.mcode, trim(j.tcode1) AS dtan, trim(j.daibunrui) AS ddai, trim(j.chubunrui) AS dbu,
           right(trim(j.bcode), 2) AS baitai, right(trim(j.bkcode), 2) AS kanri,
           coalesce(j.gtotalzn, 0) + coalesce(j.soryozn, 0) + coalesce(j.tesuzn, 0) + coalesce(j.nebikizn, 0) AS amt,
           trim(m.daibunrui) AS mdai, trim(m.chubunrui) AS mbu, trim(m.tcode1) AS mtan,
           j.mcode IN ('409118', '91210', '403959', '408720', '409119', '97987') AS taikai
      FROM trjyuden j
      JOIN msmember m ON m.id = j.id AND m.mcode = j.mcode
     WHERE j.id = p_id AND j.uday BETWEEN p_from AND p_to AND j.del IS NOT TRUE
       AND coalesce(j.skbn, '') <> '2' AND coalesce(trim(j.daibunrui), '') <> '500001'
  ), l AS (  -- 原価（実績のみ）。みなし原価の商品は売上 × 率、それ以外は受注明細の原価 × 数量
    SELECT t.denno,
           sum(CASE WHEN x.gcode IS NOT NULL THEN coalesce(t.toutmoney, 0) * x.rate
                    ELSE coalesce(t.genka, 0) * coalesce(t.suu, 0) END) AS genka,
           bool_or(t.gcode = 'LX-STB-SET') AS lux
      FROM trjyumei t
      LEFT JOIN msuriminashi x ON x.id = t.id AND x.gcode = t.gcode
     WHERE NOT p_master AND t.id = p_id AND t.del IS NOT TRUE AND t.denno IN (SELECT denno FROM d)
     GROUP BY t.denno
  ), c AS (
    SELECT d.*, coalesce(l.genka, 0) AS genka, coalesce(l.lux, false) AS lux,
           CASE WHEN p_master AND NOT d.taikai THEN d.mdai ELSE d.ddai END AS dai,
           CASE WHEN p_master AND NOT d.taikai THEN d.mbu ELSE d.dbu END AS bu,
           CASE WHEN p_master AND NOT d.taikai THEN d.mtan ELSE d.dtan END AS tan,
           CASE d.kanri WHEN '01' THEN 'a01' WHEN '02' THEN 'a03' WHEN '07' THEN 'a05' WHEN '08' THEN 'a02'
                        WHEN '09' THEN 'a06' WHEN '10' THEN 'a07' WHEN '11' THEN 'a09'
             ELSE CASE CASE WHEN p_master THEN d.mbu ELSE d.dbu END
                    WHEN '201' THEN 'a01' WHEN '203' THEN 'a03' WHEN '205' THEN 'a05' WHEN '202' THEN 'a02'
                    WHEN '207' THEN 'a06' WHEN '211' THEN 'a09'
                    ELSE CASE WHEN d.taikai THEN 'b' ELSE '' END END
           END AS sk
      FROM d LEFT JOIN l ON l.denno = d.denno
  ), r AS (
    SELECT c.ym, c.sgn, c.amt, c.genka,
           CASE WHEN c.baitai = '52' THEN c.dtan
                WHEN c.sk LIKE 'a%' AND c.lux THEN '3106'
                WHEN c.sk = 'a01' AND c.dai LIKE '2%' THEN '3017'
                WHEN c.sk = 'a07' THEN '3106'
                WHEN c.sk = 'a02' AND c.dai LIKE '2%' THEN '3114'
                WHEN c.sk LIKE 'a%' AND c.dai LIKE '2%' THEN '3017'
                WHEN c.sk = 'b' THEN CASE WHEN coalesce(c.dtan, '') = '' OR c.dtan IN ('3082', '3132') THEN '' ELSE c.dtan END
                WHEN EXISTS (SELECT 1 FROM msuritanto u WHERE u.id = p_id AND u.tcode = c.tan) THEN c.tan
                ELSE '' END AS tanto,
           CASE WHEN c.baitai = '52' THEN '施工'
                WHEN c.sk LIKE 'a%' AND c.lux THEN '300011'
                WHEN c.sk = 'a07' THEN '333333'
                WHEN c.sk LIKE 'a%' AND c.dai LIKE '2%' THEN '200001'
                ELSE coalesce(c.dai, '') END AS dai2,
           CASE WHEN c.baitai = '52' THEN coalesce(c.bu, '')
                WHEN c.sk LIKE 'a%' AND c.lux THEN '999'
                WHEN c.sk = 'a07' THEN '092'
                WHEN c.sk = 'a01' AND c.dai LIKE '2%' THEN '201'
                WHEN c.sk = 'a02' AND c.dai LIKE '2%' THEN '202'
                WHEN c.sk = 'a09' AND c.dai LIKE '2%' THEN '211'
                WHEN c.sk LIKE 'a%' AND c.dai LIKE '2%' THEN '203'
                ELSE coalesce(c.bu, '') END AS bu2
      FROM c
  )
  SELECT r.ym, r.tanto,
         CASE WHEN r.tanto = '' THEN '他'
              ELSE r.tanto || coalesce((SELECT u.name FROM msuritanto u WHERE u.id = p_id AND u.tcode = r.tanto),
                                       (SELECT s.sei FROM msstaff s WHERE s.id = p_id AND s.code = r.tanto), '') END,
         r.dai2, r.bu2, sum(r.sgn * r.amt), sum(r.sgn * (r.amt - r.genka))
    FROM r
   GROUP BY r.ym, r.tanto, r.dai2, r.bu2
$$ LANGUAGE sql STABLE
SET search_path FROM CURRENT;

CREATE OR REPLACE FUNCTION furiage_ym(p_id smallint, p_from date, p_to date)
RETURNS SETOF tsuriage_ym AS $$
  SELECT to_char(j.uday, 'YYYY-MM'),
         sum(CASE WHEN j.denku = 2 THEN -1 ELSE 1 END
             * (coalesce(j.gtotalzn, 0) + coalesce(j.soryozn, 0) + coalesce(j.tesuzn, 0) + coalesce(j.nebikizn, 0)))
    FROM trjyuden j
   WHERE j.id = p_id AND j.uday BETWEEN p_from AND p_to AND j.del IS NOT TRUE
     AND coalesce(j.skbn, '') <> '2' AND coalesce(trim(j.daibunrui), '') <> '500001'
   GROUP BY 1
$$ LANGUAGE sql STABLE
SET search_path FROM CURRENT;

CREATE OR REPLACE FUNCTION furiage_pers(p_id smallint, p_from date, p_to date)
RETURNS SETOF tsuriage_pers AS $$
  WITH d AS (
    SELECT j.ncode, j.mcode, j.tcode1, j.daibunrui, right(trim(j.bkcode), 2) AS kanri, to_char(j.uday, 'YYYY-MM') AS ym,
           CASE WHEN j.denku = 2 THEN -1 ELSE 1 END * coalesce(j.gtotalzn, 0) AS amt
      FROM trjyuden j
     WHERE j.id = p_id AND j.uday BETWEEN p_from AND p_to AND j.del IS NOT TRUE
  ), f AS (  -- 初回売上顧客: 対象年の 1 月 1 日より後に初めて売上があった納品先（過去 2 年を見る）
    SELECT j.ncode
      FROM trjyuden j
     WHERE j.id = p_id AND j.uday >= make_date(extract(year FROM p_to)::int - 2, 1, 1) AND j.gtotal > 0 AND j.del IS NOT TRUE
     GROUP BY j.ncode
    HAVING min(j.uday) > make_date(extract(year FROM p_to)::int, 1, 1)
  )
  SELECT p.seq, d.ym, sum(d.amt)
    FROM msuripers p
    JOIN d ON (p.kind = 'M' AND d.mcode = ANY (string_to_array(p.val, ',')))
           OR (p.kind = 'B' AND d.kanri = p.val)
           OR (p.kind = 'F' AND trim(d.tcode1) = p.val AND coalesce(d.daibunrui, '') NOT LIKE '2%'
               AND d.ncode IN (SELECT ncode FROM f))
   WHERE p.id = p_id
   GROUP BY p.seq, d.ym
  UNION ALL
  SELECT p.seq, to_char(j.uday, 'YYYY-MM'), sum(CASE WHEN j.denku = 2 THEN -1 ELSE 1 END * coalesce(t.toutmoney, 0))
    FROM msuripers p
    JOIN trjyuden j ON j.id = p.id AND j.uday BETWEEN p_from AND p_to AND j.del IS NOT TRUE
    JOIN trjyumei t ON t.id = j.id AND t.denno = j.denno AND t.del IS NOT TRUE
    JOIN msgoods g ON g.id = t.id AND g.gcode = t.gcode
    JOIN msggroup r ON r.id = g.id AND r.code = g.code
   WHERE p.id = p_id AND p.kind = 'G'
     AND trim(CASE split_part(p.val, ':', 1) WHEN 'tcode' THEN r.tcode WHEN 'category' THEN r.category
                                             WHEN 'genre' THEN r.genre WHEN 'subcat' THEN r.subcat END) = split_part(p.val, ':', 2)
   GROUP BY p.seq, to_char(j.uday, 'YYYY-MM')
$$ LANGUAGE sql STABLE
SET search_path FROM CURRENT;

-- ---------------------------------------------------------------------
-- Hasura 側の設定
--   ・Reload metadata
--   ・trjyuden の select / insert / update 権限（staff）に bcode, bkcode を含める
--   ・表 msuritanto, msurimoku, msuriminashi, msuripers, tsuriage, tsuriage_ym, tsuriage_pers を Track し、
--     staff に select 権限（Without any checks・すべての列）を付ける
--   ・関数 furiage, furiage_ym, furiage_pers を Track する（Data > スキーマ > Untracked custom functions）
-- 確認用（すぐ返れば OK）:
--   SELECT tname, sum(uriage) FROM furiage(1::smallint, date '2026-10-01', date '2026-10-31', false) GROUP BY 1 ORDER BY 1;
-- ---------------------------------------------------------------------
