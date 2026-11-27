-- マーシャル（現行 ID 1 → 新 ID 1）用。work\移行用SQL\tana.sql の写し（元から ID 1 だけ）  出力: trgtana1.csv
select
    ID
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
    id = 1 
    and day > '0'
    and gcode is not null
    and scode in ( 
        '    01'
        , '   001'
        , '   002'
        , '   009'
        , '   011'
        , '   013'
        , '   014'
        , '   015'
        , '   016'
        , '   017'
        , '   019'
        , '   021'
        , '   023'
        , '   032'
        , '   033'
        , '   035'
        , '   036'
        , '   037'
        , '   038'
        , '   039'
        , '   101'
        , '   102'
        , '   666'
        , '   703'
        , '   997'
    )


