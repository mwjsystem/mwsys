-- 東海堂（現行 ID 32 → 新 ID 2）用。work\移行用SQL\tana.sql の ID 32 版  出力: trgtana2.csv
--   旧 tana2.sql は条件が id = 2（現行に無い ID）だったので 32 に直した。倉庫の絞り込みは旧 tana2.sql と同じく無し
select
    2 "id"
    , Trim(SCODE)
    , DAY
    , Trim(GCODE)
    , tana
    , memo
    , ''
    , TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
    , '10'
    , TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
    , '10' 
from
    tana 
where
    id = 32 
    and day > '0'
    and gcode is not null


