-- 移行SQL（20261028_seikyu_shime.sql）適用後の検証用。参照のみ。
-- 移行SQLを適用したスキーマに search_path を合わせて実行すること。
SET search_path TO test;  -- 本番を検証するときは public に変更

SELECT '00 検証したスキーマ' AS k, current_schema()::text AS v
UNION ALL SELECT '01 バックアップ表 trseikyu_bak20261028', CASE WHEN to_regclass('trseikyu_bak20261028') IS NULL THEN '無し（移行SQL未適用）' ELSE 'あり' END
UNION ALL SELECT '02 trseikyu 行数（期待値 32111）', count(*)::text FROM trseikyu
UNION ALL SELECT '03 (id,denno) 重複', count(*)::text FROM (SELECT 1 FROM trseikyu GROUP BY id, denno HAVING count(*) > 1) x
UNION ALL SELECT '04 (id,mcode,sday) 重複', count(*)::text FROM (SELECT 1 FROM trseikyu GROUP BY id, mcode, sday HAVING count(*) > 1) x
UNION ALL SELECT '05 trseikyu の制約', string_agg(conname::text || '(' || contype::text || ')', ', ' ORDER BY conname) FROM pg_constraint WHERE conrelid = to_regclass('trseikyu')
UNION ALL SELECT '06 3001223 の有無（期待値 0）', count(*)::text FROM trseikyu WHERE denno = 3001223
UNION ALL SELECT '07 trjyuden 掛売 idenno なし（未取消）', count(*)::text || ' 件（売上日 ' || coalesce(min(uday)::text, '-') || ' ～ ' || coalesce(max(uday)::text, '-') || '）'
  FROM trjyuden WHERE torikbn AND idenno IS NULL AND (del IS NULL OR del = false)
UNION ALL SELECT '08 trjyuden の idenno(>0) が存在しない請求伝票を指す（期待値 0）', count(*)::text
  FROM trjyuden j WHERE j.idenno > 0 AND NOT EXISTS (SELECT 1 FROM trseikyu s WHERE s.id = j.id AND s.denno = j.idenno)
UNION ALL SELECT '08a trjyuden 掛売 idenno 請求済(>0)', count(*)::text FROM trjyuden WHERE torikbn AND idenno > 0
UNION ALL SELECT '08b trjyuden 掛売 idenno 移行対象外(=0)', count(*)::text || ' 件（売上日 ' || coalesce(min(uday)::text, '-') || ' ～ ' || coalesce(max(uday)::text, '-') || '）'
  FROM trjyuden WHERE torikbn AND idenno = 0
UNION ALL SELECT '08c trjyuden 都度 idenno あり（期待値 0）', count(*)::text FROM trjyuden WHERE torikbn IS NOT TRUE AND idenno IS NOT NULL
UNION ALL SELECT '08d 次の締めで計上される掛売（2026年以降・未取消）', count(*)::text || ' 件 / 請求先 ' || count(DISTINCT scde) || ' 件（返品 ' || count(*) FILTER (WHERE jdstatus = '2') || ' 件）'
  FROM trjyuden WHERE torikbn AND idenno IS NULL AND uday IS NOT NULL AND (del IS NULL OR del = false)
UNION ALL SELECT '09 trjyuden のトリガー', coalesce(string_agg(tgname, ', '), '無し') FROM pg_trigger WHERE tgrelid = to_regclass('trjyuden') AND NOT tgisinternal
UNION ALL SELECT '10 trnyusub kubun=1 kdenno 計上済(>0)', count(*)::text FROM trnyusub WHERE kubun = 1 AND kdenno > 0
UNION ALL SELECT '11 trnyusub kubun=1 kdenno 移行対象外(=0)', count(*)::text FROM trnyusub WHERE kubun = 1 AND kdenno = 0
UNION ALL SELECT '12 trnyusub kubun=1 kdenno 未計上(NULL)', count(*)::text || ' 件（入金日 ' || coalesce(min(day)::text, '-') || ' ～ ' || coalesce(max(day)::text, '-') || '）'
  FROM trnyusub WHERE kubun = 1 AND kdenno IS NULL AND del IS NULL
UNION ALL SELECT '13 trnumber idenno', string_agg(curnum::text, ', ') FROM trnumber WHERE type = 'idenno'
UNION ALL SELECT '14 trseikyu 最大 denno', max(denno)::text FROM trseikyu
ORDER BY k;
