-- 東海堂（現行 ID 32 → 新 ID 2）用。品目マスタ  出力: msgoods.csv（ヘッダ付き）
--   04_goods.sql で差分更新する。ヘッダの列名は新システム msgoods の列名（列名で当てる）。
--   ここに無い列（サイズ・色・重量・送料区分・個口・発注ロット・海外発注品番・加工前品番・在庫表の列など）は
--   新システムだけの列なので、差分更新で触らない。
--
--   現行 GOODS（ファイルレイアウト v322 の【08】）→ 新システム msgoods
--     code    → gcode   （前後の空白を取り、大文字。受注明細などの移行と同じ）
--     name    → gtext   商品名
--     barcode → jan
--     tani    → unit
--     tanano  → tanano  棚番号
--     zkbn    → zkbn    在庫区分（0 対象 / 1 対象外。新システムの「×在庫区分」と同じ意味）
--     skbn・zkbn → gskbn 数量区分（在庫対象外は 2 非在庫、集合・セットは 1、単品は 0。受注明細の移行と同じ）
--     tkbn    → tkbn    中止区分。現行の 1 中止 → 新システムの 9 廃盤、0 通常 → 0
--                       （04_goods.sql では、新システムで 1 発注専用・2 在庫管理用にした商品は、現行が中止にならない限り変えない）
--     ''00TMP'' → code  商品グループ。新システムに無い商品を追加するときだけ使う（一時仮グループ。既存の商品のグループは変えない）
--                       新 ID 2 の商品グループマスタに 00TMP があること（無ければ先に作る）
--   使っていない現行の列: kana, subname, dbun, sbun（単価の通貨の判定に使用。ID 32 は '2' が USD）, gkbn, kake, bikou, fcode1-3, fmemo1-3,
--                         fday1-3, image1-2, kakuho, konpo, tbun, free1-3
select
    2                                   "id"
    , trim(upper(g.code))                  "gcode"
    , g.name                               "gtext"
    , trim(g.barcode)                      "jan"
    , g.tani                               "unit"
    , trim(g.tanano)                       "tanano"
    , to_char(g.zkbn)                      "zkbn"
    , decode(g.zkbn, 1, '2', decode(g.skbn, 0, '0', '1')) "gskbn"
    , decode(g.tkbn, 1, '9', '0')          "tkbn"
    , '00TMP'                              "code"
from
    goods g
where
    g.id = 32
    and trim(g.code) is not null
order by
    g.code
