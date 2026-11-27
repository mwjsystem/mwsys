-- 東海堂（現行 ID 32 → 新 ID 2）用。work\移行用SQL\vendor.sql の ID 32 版（2026-11-27）
select
    2 "id"
    , trim(code)
    , zip
    , ADR1
    , ADR2
    , ADR3
    , ADR4
    , TEL
    , FAX
    , ''
    , ''
    , ''
    , name
    , concat(memo1, memo2) adrbikou
    , ''
    , mail
    , ''
    , ''
    , ''
    , ''
    , ''
    , memo3
    , tanto
    , VURL
    , kana
    , '10'
    , TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
    , '10'
    , TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
    , taxkbn
    , CASE substr(trim(code), 1, 2) 
        WHEN '01' THEN 'USD' 
        else 'JPY' 
        END currency
    , '' 
from
    vendor 
where
    id = 32


