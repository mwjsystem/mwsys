-- =====================================================================
-- 受注履歴（現行の「LST-HIST.xlsm」の置き換え）
--
--   fjyuhist : 条件に合う受注伝票の、全明細を返す（Hasura で Track して画面から呼ぶ）
--              p_mcode  受注先（'' は指定なし）
--              p_gcode  商品（'' は指定なし）。この商品を含む受注を探す。該当の明細は hit = true
--              p_from / p_to  受付日の範囲
--              p_limit  伝票数の上限。超えたら新しい伝票から p_limit 件を返す
--
--   マクロの SQL との違い
--     ・マスタの結合はすべて left join（マスタ側が無い伝票が一覧から消えないように）
--     ・取消した伝票・明細は del IS NOT TRUE で除く（del が null の行を含める）
--
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する。
--           索引の作成に時間がかかる（本番で 30 秒を超えることがある）。
--           Hasura の画面が 30 秒で切れても DB では処理が続くので、もう一度実行しないこと。
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

CREATE INDEX IF NOT EXISTS trjyuden_mcode_day_idx ON trjyuden (id, mcode, day);
CREATE INDEX IF NOT EXISTS trjyumei_gcode_idx ON trjyumei (id, gcode, denno);

-- 関数の戻り値の型（Hasura の関数は、Track した表の行を返す必要がある。行は入らない）
CREATE TABLE IF NOT EXISTS tjyuhist (
    denno    bigint
  , day      date
  , sday     date
  , uday     date
  , line     integer
  , gcode    text
  , gtext    text
  , suu      numeric
  , unit     text
  , money    numeric
  , mtax     text
  , kkr      numeric
  , tanka    numeric
  , taxrate  text
  , soko     text
  , mmemo    text
  , jname    text
  , pname    text
  , cusden   text
  , hname    text
  , okurino  text
  , okurisuu text
  , hday     date
  , htime    text
  , mcode    text
  , nadr     text
  , adrname  text
  , tnaikin  text
  , teigyo   text
  , dai      text
  , chu      text
  , sho      text
  , dmemo    text
  , nmemo    text
  , omemo    text
  , url      text
  , hit      boolean
);

CREATE OR REPLACE FUNCTION fjyuhist(p_id smallint, p_mcode text, p_gcode text, p_from date, p_to date, p_limit integer)
RETURNS SETOF tjyuhist AS $$
  WITH h AS (
    SELECT a.denno
      FROM trjyuden a
     WHERE a.id = p_id AND a.del IS NOT TRUE AND a.day BETWEEN p_from AND p_to
       AND (p_mcode = '' OR a.mcode = p_mcode)
       AND (p_gcode = '' OR a.denno IN (SELECT m.denno FROM trjyumei m WHERE m.id = p_id AND m.gcode = p_gcode AND m.del IS NOT TRUE))
     ORDER BY a.day DESC, a.denno DESC
     LIMIT p_limit
  )
  SELECT a.denno::bigint, a.day::date, a.sday::date, a.uday::date,
         b.line::integer, b.gcode::text, b.gtext::text, b.suu::numeric, c.unit::text, b.money::numeric, b.mtax::text,
         CASE WHEN b.tanka1 = 0 THEN 0::numeric
              WHEN trim(b.mtax::text) = '1' THEN coalesce(b.tanka, 0)::numeric / b.tanka1
              ELSE coalesce(b.tanka, 0)::numeric * (1 + cast(nullif(trim(b.taxrate::text), '') AS numeric) / 100) / b.tanka1 END,
         b.tanka::numeric, b.taxrate::text, d.subname::text, b.mmemo::text,
         e.viewval::text, f.viewval::text, a.cusden::text, g.name::text, a.okurino::text, a.okurisuu::text,
         a.hday::date, x.name::text, a.mcode::text, a.nadr::text, i.adrname::text,
         j.sei::text, k.sei::text, l.viewval::text, m.viewval::text, n.viewval::text,
         a.dmemo::text, a.nmemo::text, a.omemo::text, o.url::text,
         p_gcode <> '' AND b.gcode = p_gcode
    FROM h
    JOIN trjyuden a ON a.id = p_id AND a.denno = h.denno
    JOIN trjyumei b ON b.id = a.id AND b.denno = a.denno AND b.del IS NOT TRUE
    LEFT JOIN msgoods c ON c.id = b.id AND c.gcode = b.gcode
    LEFT JOIN msstore d ON d.id = b.id AND d.code = b.scode
    LEFT JOIN msbunrui e ON e.id = a.id AND e.kubun = 'jcode' AND e.value = a.jcode
    LEFT JOIN msbunrui f ON f.id = a.id AND f.kubun = 'pcode' AND f.value = a.pcode
    LEFT JOIN mshokuri g ON g.id = a.id AND g.code = a.hcode
    LEFT JOIN mshktime x ON x.id = a.id AND x.code = a.htime AND x.hscode = g.hscode
    LEFT JOIN msmadr i ON i.id = a.id AND i.mcode = a.ncode AND i.eda = a.nadr
    LEFT JOIN msstaff j ON j.id = a.id AND j.code = a.tcode
    LEFT JOIN msstaff k ON k.id = a.id AND k.code = a.tcode1
    LEFT JOIN msbunrui l ON l.id = a.id AND l.kubun = 'daibunrui' AND l.value = a.daibunrui
    LEFT JOIN msbunrui m ON m.id = a.id AND m.kubun = 'chubunrui' AND m.value = a.chubunrui
    LEFT JOIN msbunrui n ON n.id = a.id AND n.kubun = 'shobunrui' AND n.value = a.shobunrui
    LEFT JOIN mshaisou o ON o.id = g.id AND o.code = g.hscode
$$ LANGUAGE sql STABLE
SET search_path FROM CURRENT;

-- ---------------------------------------------------------------------
-- Hasura 側の設定
--   ・Reload metadata
--   ・表 tjyuhist を Track し、staff に select 権限（Without any checks・すべての列）を付ける
--   ・関数 fjyuhist を Track する（Add As Root Field）
-- 確認用（すぐ返れば OK。単独で実行するときは既定の public を見るので、スキーマ名を付ける）:
--   SELECT count(*), count(DISTINCT denno) FROM test.fjyuhist(1::smallint, '', 'ここに商品コード', date '2025-11-01', date '2026-11-01', 3001);
-- ---------------------------------------------------------------------
