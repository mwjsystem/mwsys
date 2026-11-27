-- 東海堂（現行 ID 32 → 新 ID 2）用。work\移行用SQL\jyumei.sql の ID 32 版（返品の番号の付け方は旧 jyumei2.sql と同じ）  出力: trjyumei1.csv（件数が多ければ denno の範囲で分けて trjyumei2.csv / trjyumei3.csv にしてよい）
select
    2 "id"
    , case 
        when j.denku > 0
            then case 
            when (j.denno, j.day) IN ( 
                (5048394, '20190118')
                , (5046281, '20181205')
            ) 
                then j.denno + 30000000 
            else j.denno + 20000000 
            end 
        else j.denno 
        end denno
    , j.LINE
    , DECODE(j.sday, 0, '', j.sday)
    , trim(j.souko)
    , trim(upper(j.gcode)) GCODE
    , g.name
    , j.suu
    , j.day TANKA1
    , j.tanka
    , j.money
    , j.taxkbn
    , j.mbikou
    , j.genka genka  -- USD の商品は外貨のまま。02_after_load.sql が受注日のレート（msrate）で円にする（旧 jyumei2.sql は sbun = 1 を 110 倍していたが、ID 32 の海外は sbun = 2）
    , '1' SPEC
    , j.tintanka
    , j.touttanka
    , j.taxtanka
    , j.tinmoney
    , j.toutmoney
    , j.taxmoney
    , trunc(COALESCE(j.taxrate,8))
    , ' ' spdet
    , 0 tgenka
    , '' del
    , decode(g.zkbn, 1, 2, decode(g.skbn, 0, 0, 1)) gskbn
    , case trim(g.sbun) when '2' then 'USD' else 'JPY' end currency  -- 仕入区分 sbun の海外（ID 1 は 1、ID 32 は 2）
from
    jyumei j 
    inner join goods g 
        on j.id = g.id 
        and j.gcode = g.code 
where
    j.id = 32     


