-- マーシャル（現行 ID 1 → 新 ID 1）用。work\移行用SQL\gzai.sql の ID 1 版（2026-11-27）
select
    id "id"
    , trim(UPPER(code)) "gcode"
    , trim(UPPER(zcode)) "zcode"
    , irisuu "irisu" 
from
    gzai 
where
    id = 1


