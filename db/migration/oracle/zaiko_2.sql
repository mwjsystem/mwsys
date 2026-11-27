-- 東海堂（現行 ID 32 → 新 ID 2）用。work\移行用SQL\zaiko.sql の ID 32 版  出力: trzaiko2.csv（day の範囲を確認すること。今はマーシャルと同じ 2023-07-01 以降だけ）
--   倉庫の絞り込みは旧 zaiko2.sql と同じく無し。商品コードは他の表と合わせて大文字にする（旧 zaiko2.sql は trim だけ）
select
    2 "id"
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
    id = 32
--    and day between '20000101' AND '20141231'
--    and day between '20150101' AND '20230630'
   and day > '20230630' 
   and trim(gcode) is not null

