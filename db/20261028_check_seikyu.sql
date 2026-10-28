-- 既存（移行）データの確認用 その2。参照のみで、データは変更しない。
-- Hasura コンソール > Data > SQL で実行し、結果（k, v の一覧）を共有してください。
SET search_path TO public;  -- テスト環境を確認するときは test に変更

-- 各掛売受注伝票・請求入金伝票が、移行時にどの請求伝票（売上日・入金日以降で最初の締め日）に計上済とみなせるか
WITH jmap AS (
  SELECT j.denno, j.scde, j.uday,
         (SELECT s.denno FROM trseikyu s
           WHERE s.id = j.id AND s.mcode = j.scde AND s.sday >= j.uday
           ORDER BY s.sday LIMIT 1) AS idenno
    FROM trjyuden j
   WHERE j.torikbn AND j.idenno IS NULL AND j.uday IS NOT NULL
     AND (j.del IS NULL OR j.del = false)
), nmap AS (
  SELECT n.denno, n.mcode, n.day,
         (SELECT s.denno FROM trseikyu s
           WHERE s.id = n.id AND s.mcode = n.mcode AND s.sday >= n.day
           ORDER BY s.sday LIMIT 1) AS kdenno
    FROM trnyusub n
   WHERE n.kubun = 1 AND n.del IS NULL
), pair AS (
  SELECT id, mcode, sday FROM trseikyu GROUP BY id, mcode, sday HAVING count(DISTINCT denno) > 1
)
SELECT '11 同一顧客・同一締め日で別番号 ' || s.mcode || ' ' || s.sday AS k,
       string_agg('denno=' || s.denno || ' bcode=' || coalesce(s.bcode, '(null)')
                  || ' 前回=' || coalesce(s.zenkai, 0) || ' 入金=' || coalesce(s.nmon, 0)
                  || ' 調整=' || coalesce(s.tmon, 0) || ' 買上=' || coalesce(s.taxmon, 0)
                  || ' 税=' || coalesce(s.tax, 0) || ' 請求=' || coalesce(s.seikyu, 0), ' | ' ORDER BY s.denno) AS v
  FROM trseikyu s JOIN pair p USING (id, mcode, sday)
 GROUP BY s.mcode, s.sday
UNION ALL SELECT '12 trjyuden 掛売 idenno なし（売上日あり・未取消）', count(*)::text || ' 件（売上日 ' || coalesce(min(uday)::text, '-') || ' ～ ' || coalesce(max(uday)::text, '-') || '）' FROM jmap
UNION ALL SELECT '13 trjyuden 掛売 idenno あり', count(*)::text FROM trjyuden WHERE torikbn AND idenno IS NOT NULL
UNION ALL SELECT '14 trjyuden 掛売 移行で請求済にできる', count(*)::text FROM jmap WHERE idenno IS NOT NULL
UNION ALL SELECT '15 trjyuden 掛売 未請求のまま残る', count(*)::text || ' 件 / 請求先 ' || count(DISTINCT scde) || ' 件（売上日 ' || coalesce(min(uday)::text, '-') || ' ～ ' || coalesce(max(uday)::text, '-') || '）' FROM jmap WHERE idenno IS NULL
UNION ALL SELECT '16 未請求のまま残る 2026-01-01 より前', count(*)::text FROM jmap WHERE idenno IS NULL AND uday < '2026-01-01'
UNION ALL SELECT '17 trnyusub kubun=1 件数', count(*)::text || ' 件（入金日 ' || coalesce(min(day)::text, '-') || ' ～ ' || coalesce(max(day)::text, '-') || '）' FROM nmap
UNION ALL SELECT '18 trnyusub kubun=1 移行で計上済にできる', count(*)::text FROM nmap WHERE kdenno IS NOT NULL
UNION ALL SELECT '19 trnyusub kubun=1 未計上のまま残る', count(*)::text || ' 件（入金日 ' || coalesce(min(day)::text, '-') || ' ～ ' || coalesce(max(day)::text, '-') || '）' FROM nmap WHERE kdenno IS NULL
UNION ALL SELECT '20 trnumber', string_agg(type || '=' || curnum, ', ') FROM trnumber
UNION ALL SELECT '21 msmember 締め日あり', count(*)::text || ' 件（値: ' || string_agg(DISTINCT sime::text, ',') || '）' FROM msmember WHERE sime IS NOT NULL
ORDER BY k;
