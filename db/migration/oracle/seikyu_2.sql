-- 東海堂（現行 ID 32 → 新 ID 2）用。work\移行用SQL\seikyu.sql の ID 32 版（2026-11-27）
select 	2 "id"
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
where id = 32

