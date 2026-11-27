-- マーシャル（現行 ID 1 → 新 ID 1）用。work\移行用SQL\jyumei.sql の写し（元から ID 1 だけ）  出力: trjyumei1.csv / trjyumei2.csv / trjyumei3.csv（denno の範囲を分けて 3 回出す。下の where を書き換える）
select
    j.id
    , case 
        when j.denku = 2 
            then case 
            when (j.denno, j.day) IN ( 
                (3372984, '20230317')
                , (3298327, '20201203')
                , (3291711, '20200228')
                , (3359935, '20220909')
                , (3391832, '20230928')
                , (3267123, '20191213')
                , (3386271, '20240325')
                , (3440516, '20250530')
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
    , j.genka genka  -- USD の商品は外貨のまま。02_after_load.sql が受注日のレート（msrate）で円にする（以前は 110 倍の固定）
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
    , case trim(g.sbun) when '1' then 'USD' else 'JPY' end currency  -- 仕入区分 sbun の海外（ID 1 は 1、ID 32 は 2）
from
    jyumei j 
    inner join goods g 
        on j.id = g.id 
        and j.gcode = g.code 
where
    j.id = 1     
--     and j.denno < 3200000
    and j.denno >= 3200000


