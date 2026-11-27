-- マーシャル（現行 ID 1 → 新 ID 1）用。work\移行用SQL\movsub.sql の ID 1 版（2026-11-27）
select distinct
    m.id "id"
    , m.denno
    , DECODE(o.hday, 0, '', o.hday) hday
    , o.htime
    , o.hcode
    , nvl(o.okurino, ' ')
    , o.okurisuu
    , nvl(concat(o.obikou1, o.obikou2), ' ') obikou
    , trim(m.tcode)
    , TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS') cre
    , '10'
    , TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS') upd
    , '10'
    , m.day
    , trim(m.incode)
    , trim(m.outcode)
    , ''
    , ''
    , m.day yday 
from
    movden m 
    left outer join okurisub o
    on m.id = o.id 
    and m.denno = o.denno 
where
    m.id = 1


