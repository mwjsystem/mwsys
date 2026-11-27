-- マーシャル（現行 ID 1 → 新 ID 1）用。work\移行用SQL\siimei.sql の ID 1 版（2026-11-27）
select
    id "id"
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
    id = 1


