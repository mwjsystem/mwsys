-- 顧客住所（マーシャル・ID 1）  出力ファイル: msmadr.csv（ヘッダ付き）
--   旧 memadr.sql の ID 1 版。列の並びは msmadr の先頭からの並び（load.ps1 が先頭から列数分を当てる）
--   htitle の '様' は旧ファイルで文字化けしていたので書き直した（文字コードに注意）
select
    a.id                                   "id"
    , trim(a.code)
    , a.eda
    , replace(a.zip, '-', '')
    , a.adr1
    , a.adr2
    , a.adr3
    , a.adr4
    , tel.tel
    , fax.tel fax
    , etc.tel tel2
    , ''
    , ''
    , a.adrname
    , concat(concat(a.adrbikou1, a.adrbikou2), a.adrbikou3) nbikou
    , ''
    , ''
    , ''
    , concat(concat(nvl2(tel.keytel, concat(tel.keytel, '/'), ''), nvl2(fax.keytel, concat(fax.keytel, '/'), '')), nvl2(etc.keytel, concat(etc.keytel, '/'), '')) ftel
    , ''
    , '様' htitle
from
    memadr a
    inner join member m on a.id = m.id and a.code = m.code
    left outer join memtel tel on a.id = tel.id and a.code = tel.code and a.eda = tel.eda and tel.kubun = 0
    left outer join memtel fax on a.id = fax.id and a.code = fax.code and a.eda = fax.eda and fax.kubun = 1
    left outer join memtel etc on a.id = etc.id and a.code = etc.code and a.eda = etc.eda and etc.kubun = 2
where
    a.id = 1
order by a.code, a.eda
