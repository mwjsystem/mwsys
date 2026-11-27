-- 東海堂（現行 ID 32 → 新 ID 2）用。work\移行用SQL\movden.sql の ID 32 版（2026-11-27）
select
    2 "id"
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
    id = 32
 and gcode is not null
order by
    denno
    , line


