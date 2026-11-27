-- マーシャル（現行 ID 1 → 新 ID 1）用。work\移行用SQL\gtanka.sql の ID 1 版（2026-11-27）  出力: msgtanka.csv
--   04_goods.sql で差分更新するため、ヘッダの列名は新システム msgtanka の列名にしている（列名で当てる）
--   ID 1 は tanka9 を営業原価 cost に入れ、tanka9 は 0（旧 gtanka.sql と同じ）
select
    t.id                                   "id"
    , trim(upper(t.code))                  "gcode"
    , decode(t.day, 0, '20000101', t.day)  "day"
    , t.tanka1                             "tanka1"
    , t.tanka2                             "tanka2"
    , t.tanka3                             "tanka3"
    , t.tanka4                             "tanka4"
    , t.tanka5                             "tanka5"
    , t.tanka6                             "tanka6"
    , t.tanka7                             "tanka7"
    , t.tanka8                             "tanka8"
    , 0                                    "tanka9"
    , t.tanka9                             "cost"
    , t.genka                              "genka"
    , t.taxrate                            "taxrate"
    , case trim(g.sbun) when '1' then 'USD' else 'JPY' end "currency"
from
    gtanka t
    inner join goods g on g.id = t.id and g.code = t.code
where
    t.id = 1
