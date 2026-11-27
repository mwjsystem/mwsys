-- マーシャル（現行 ID 1 → 新 ID 1）用。work\移行用SQL\zaiko.sql の写し（元から ID 1 だけ）  出力: trzaiko1.csv（day の範囲のコメントを確認すること。今は 2023-07-01 以降だけ）
select
    ID
    , Trim(SCODE)
    , Trim(UPPER(GCODE))
    , DAY
    , HATU
    , HNYU
    , NYUK
    , JYUT
    , (SYUK - HENP) SYUK
    , HENP
    , MOVI
    , MOVO
    , HAKI
    , TENI
    , TENO
from
    zaiko 
where
    id = 1 
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
        , '   501'
        , '   502'
        , '   503'
        , '   504'
        , '   505'
        , '   506'
        , '   507'
        , '   508'
        , '   509'
        , '   510'
        , '   511'
        , '   666'
        , '   703'
        , '   997'
    )
--    and day between '20000101' AND '20141231'
--    and day between '20150101' AND '20230630'
   and day > '20230630' 
   and trim(gcode) is not null

