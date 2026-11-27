-- 東海堂（現行 ID 32 → 新 ID 2）用。work\移行用SQL\inzai.sql の ID 32 版（2026-11-27）
select
    2 "id"
    , denno
    , line
    , day
    , trim(scode)
    , trim(gcode) GCODE
    , suu
    , nvl(memo, ' ')
    , TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
    , '10'
    , TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
    , '10'
    , trim(tcode) 
from
    inzai 
where
    id = 32 
order by
    denno
    , line


