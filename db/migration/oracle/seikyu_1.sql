-- マーシャル（現行 ID 1 → 新 ID 1）用。work\移行用SQL\seikyu.sql の ID 1 版（2026-11-27）
select 	id "id"
,	trim(code)
,	denno
,	sday
,	zenkai
,	nmon
,	tmon
,	taxmon
,	tax
,	seikyuu
,   bcode
from seikyuu
where id = 1

