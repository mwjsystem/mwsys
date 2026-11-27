-- =====================================================================
-- 顧客マスタ（マーシャル・現行 ID 1 → 新 ID 1）  出力ファイル: msmember.csv（ヘッダ付き）
--   新システムの mig_msmember（03_member.sql）に入れる。列の並びを変えないこと。
--   旧 member.sql との違い:
--     ・最新の受注伝票から取っていた 配送(hcode)・内勤担当(tcode)・帳票タイプ(ntype)・受注区分(jcode) は
--       ここでは出さない。新システムに入れた受注伝票から 03_member.sql で補完する（受注先＝顧客コードで最新）
--     ・請求書区分 seikyuu を最後に追加（20261028_invoice_pdf.sql の注記どおり）
-- =====================================================================
select
    m.id                                   "id"
    , trim(m.code)                         "mcode"
    , nvl(m.simei, 'dummy')                "sei"
    , m.kana                               "kana"
    , m.tankakbn                           "tankakbn"
    , m.mtax                               "mtax"
    , m.pay                                "pcode"
    , trim(m.fcode1)                       "daibunrui"
    , trim(m.fcode2)                       "chubunrui"
    , trim(m.fcode3)                       "tcode1"
    , case
        when m.simei like '●%' then 'true'
        when m.simei like '×%' then 'true'
        when m.simei like '%使用%' then 'true'
        else 'false'
      end                                  "del"
    , concat(concat(nvl2(m.bikou1, concat(m.bikou1, '／'), ''), nvl2(m.bikou2, concat(m.bikou2, '／'), '')), m.bikou3) "dmemo"
    , concat(concat(m.fmemo1, m.fmemo2), m.fmemo3) "memo"
    , case m.torikbn when 1 then 'true' else 'false' end "torikbn"
    , m.sime                               "sime"
    , m.site                               "site"
    , m.inday                              "inday"
    , trim(m.icode)                        "scde"
    , trim(m.sscode)                       "sscode"
    , ma.mail                              "mail"
    , ma2.mail                             "mail2"
    , ma3.mail                             "mail3"
    , ma4.mail                             "mail4"
    , m.seikyuu                            "seikyuu"
from
    member m
    left outer join memmail ma  on m.id = ma.id  and m.code = ma.code  and ma.eda = 1
    left outer join memmail ma2 on m.id = ma2.id and m.code = ma2.code and ma2.eda = 2
    left outer join memmail ma3 on m.id = ma3.id and m.code = ma3.code and ma3.eda = 3
    left outer join memmail ma4 on m.id = ma4.id and m.code = ma4.code and ma4.eda = 4
where
    m.id = 1
order by
    m.code
