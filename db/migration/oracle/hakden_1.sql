-- マーシャル（現行 ID 1 → 新 ID 1）用。work\移行用SQL\hakden.sql の ID 1 版（2026-11-27）
select
    id "id"
    , denno
    , line
    , day
    , trim(scode)
    , trim(gcode) GCODE
    , suu
    , nvl(memo, ' ')
    , hakikbncd
    , TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
    , '10'
    , TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
    , '10'
    , trim(tcode) 
from
    hakiden 
where
    id = 1
order by
    denno
    , line


