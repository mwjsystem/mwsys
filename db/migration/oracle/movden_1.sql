-- マーシャル（現行 ID 1 → 新 ID 1）用。work\移行用SQL\movden.sql の ID 1 版（2026-11-27）
select
    id "id"
    , denno
    , line
    , trim(gcode) GCODE
    , suu
    , nvl(memo, ' ')
    , 0 jdenno
    , 0 jline
    , '' kako 
from
    movden 
where
    id = 1
 and gcode is not null
order by
    denno
    , line


