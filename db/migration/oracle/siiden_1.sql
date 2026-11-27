-- マーシャル（現行 ID 1 → 新 ID 1）用。work\移行用SQL\siiden.sql の ID 1 版（2026-11-27）
select
    id "id"
    , denno
    , trim(vcode)
    , DECODE(day, 0, '', day) inday
    , trim(souko)
    , trim(tcode)
    , concat(dbikou1, concat(dbikou2, dbikou3)) dbikou
    , Gtotal
    , souryou
    , tesuu
    , tax
    , total
    , TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
    , '10'
    , TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
    , '10'
    , CASE substr(trim(vcode), 1, 2) 
        WHEN '01' THEN 'USD' 
        else 'JPY' 
        END currency 
from
    siiden 
where
    id = 1


