-- 東海堂（現行 ID 32 → 新 ID 2）用。work\移行用SQL\gzai.sql の ID 32 版（2026-11-27）
select
    2 "id"
    , trim(UPPER(code)) "gcode"
    , trim(UPPER(zcode)) "zcode"
    , irisuu "irisu" 
from
    gzai 
where
    id = 32


