-- マーシャル（現行 ID 1 → 新 ID 1）用。work\移行用SQL\hatmei.sql の ID 1 版（2026-11-27）
select
    m.id "id"
    , m.denno
    , m.line
    , m.day
    , DECODE(m.inday, 0, '', m.inday)
    , trim(m.gcode) GCODE
    , g.name
    , m.suu
    , m.tanka
    , m.money
    , nvl(m.taxrate, '')
    , nvl(m.mbikou, ' ')
    , ' '
    , ''
    , DECODE(m.inday, 0, '', m.inday)
    , ''
    , indaykbn
    , taxflg 
from
    hatumei m 
    inner join goods g 
        on m.id = g.id 
        and m.gcode = g.code 
where
    m.id = 1


