-- マーシャル（現行 ID 1 → 新 ID 1）用。work\移行用SQL\hatden.sql の ID 1 版（2026-11-27）
select
    id "id"
    , denno
    , trim(vcode)
    , day
    , trim(souko)
    , trim(tcode)
    , concat(dbikou1, concat(dbikou2, dbikou3)) dbikou
    , ' '
    , Gtotal
    , ttotal
    , tax
    , total
    , TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
    , '10'
    , TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
    , '10'
    , ' '
    , '1'
    , ''
    , CASE substr(trim(vcode), 1, 2) 
        WHEN '01' THEN 'USD' 
        else 'JPY' 
        END currency 
from
    hatuden 
where
    id = 1


