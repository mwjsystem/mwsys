-- 東海堂（現行 ID 32 → 新 ID 2）用。work\移行用SQL\jyuden.sql の ID 32 版（返品の番号の付け方・通貨は旧 jyuden2.sql と同じ）  出力: trjyuden2.csv
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
    , DECODE(j.day, 0, '20000101', j.day) day
    , DECODE(j.yday, 0, '', j.yday) yday
    , DECODE(j.sday, 0, '', j.sday) sday
    , DECODE(j.uday, 0, '', j.uday) uday
    , DECODE(j.nday, 0, '', j.nday) nday
    , DECODE(j.hday, 0, '', j.hday) hday
    , j.htime
    , j.hcode
    , decode(trim(j.ncode),'ZZ0000093039','60',trim(j.ncode))
    , j.nadr
    , trim(j.souko)
    , trim(j.tcode)
    , j.bunsyo
    , concat(j.dbikou1, concat(j.dbikou2, j.dbikou3)) bikou
    , concat(j.nbikou1, j.nbikou2) nbikou
    , concat(j.obikou1, j.obikou2) obikou
    , j.nosi
    , j.okurisuu
    , j.okurino
    , j.fmemo1 cusden
    , concat(j.fmemo2, j.fmemo3) sbikou
    , j.gtotal
    , j.souryou
    , j.tesuu
    , j.nebiki
    , j.ttotal
    , j.tax
    , j.syoukei
    , j.total
    , j.okurinusi
    , j.skbn
    , j.uttotal
    , j.utax
    , j.httotal
    , j.gtotalzn
    , j.souryouzn
    , j.tesuuzn
    , j.nebikizn
    , j.taxtotal
    , ''
    , ''
    , ''
    , s.torikbn
    , decode(trim(s.mcode),'ZZ0000093039','60',trim(s.mcode))
    , trim(s.scode)
    , s.jcode
    , s.pcode
    , s.fcode1 daibunrui
    , trim(s.fcode2) chubunrui
    , ''
    , trim(s.fcode3) tcode1
    , 'false'
    , TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
    , '10'
    , TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
    , '10'
    , case 
        when trim(s.mcode) IN ('405482', '409150') 
            then nvl(replace (j.fmemo3, ','), '0') 
        else '0' 
        end daibiki
    , '' ryoate
    , j.denku jdstatus
    , '' iadr
    , total8
    , total10
    , '' dokono
    , case 
        when trim(s.mcode) IN ('405482', '409150') 
            then nvl(replace (j.fmemo2, ','), '0') 
        else '0' 
        end daibzei
    , '' eidome
    , '' eicode
    , 0 idenno 
    , trim(s.bcode) bcode
    , trim(s.bkcode) bkcode 
from
    jyuden j 
    inner join jyusub s 
        on j.id = s.id 
        and j.denno = s.denno 
where
    j.id = 32                                   

