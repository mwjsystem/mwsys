-- 東海堂（現行 ID 32 → 新 ID 2）用。work\移行用SQL\siimei.sql の ID 32 版（2026-11-27）
select
    2 "id"
    , denno
    , line
    , DECODE(day, 0, '', day) inday
    , trim(gcode) GCODE
    , suu
    , tanka
    , money
    , nvl(taxrate, '')
    , nvl(mbikou, ' ')
    , ' '
    , taxflg
    , trim(souko)
    , tsuu
    , hdenno
    , hline 
from
    siimei 
where
    id = 32


