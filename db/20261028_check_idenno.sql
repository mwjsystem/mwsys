-- trjyuden.idenno の既存の使われ方の確認用。参照のみ。
SET search_path TO test;

SELECT CASE WHEN j.torikbn THEN '掛売' ELSE '都度' END             AS 区分,
       CASE WHEN j.idenno IS NULL THEN 'なし'
            WHEN s.denno IS NOT NULL THEN 'trseikyu にある'
            WHEN j.idenno = j.denno THEN '自伝票番号と同じ'
            ELSE 'trseikyu に無い' END                              AS idenno,
       count(*)                                                     AS 件数,
       min(j.idenno)                                                AS idenno最小,
       max(j.idenno)                                                AS idenno最大,
       min(j.day)                                                   AS 受注日最小,
       max(j.day)                                                   AS 受注日最大,
       count(DISTINCT j.idenno)                                     AS idenno種類
  FROM trjyuden j
  LEFT JOIN trseikyu s ON s.id = j.id AND s.denno = j.idenno
 GROUP BY 1, 2
 ORDER BY 1, 2;
