-- =====================================================================
-- ロイヤリティ: 団体を 3 つ足す（極真拳武會 / 全硬連 / 極真半期）
--
--   kenbu    極真拳武會      月ごと。拳武會の商品（…-KEN）の数量 × 1 個ごとの金額（税込）
--   zenkoren 全硬連          半期。区分ごとのシートに、商品コード・単価ごとの数量
--   khanki   極真半期        半期。卸の顧客への極真の道着・帯の数量 × 1 枚ごとの金額
--
--   20261129_royalty.sql（テーブルと初期データ）を実行したあとに実行する。
--   もう一度実行すると、この 3 団体のマスタは初期データに戻る（ほかの団体はそのまま）。
--
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する。
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

DELETE FROM msroyorg WHERE id = 1 AND org IN ('kenbu', 'zenkoren', 'khanki');
DELETE FROM msroyitem WHERE id = 1 AND org IN ('kenbu', 'zenkoren', 'khanki');
DELETE FROM msroymem WHERE id = 1 AND org IN ('kenbu', 'zenkoren', 'khanki');

INSERT INTO msroyorg (id, org, seq, name, dest, dest2, regno, bank, bank2, tanto, greet) VALUES
  (1, 'kenbu', 110, '極真拳武會', E'極真拳武會\n金子　雅弘　様', NULL, NULL,
   E'三菱東京ＵＦＪ銀行　蒲田支店\n口座番号：普通0834993\n名義：ｼﾔﾀﾞﾝﾎｳｼﾞﾝ ｷﾖｸｼﾝﾌﾞﾄﾞｳｶﾗﾃﾚﾝﾒｲｷﾖｸｼﾝｹﾝﾌﾞｶｲ', NULL, NULL,
   E'拝啓　時下、益々ご清栄のこととお慶び申し上げます。平素は格別のお引き立てを賜り、厚く御礼申し上げます。\n今回のロイヤリティーにつきましては、下記明細の通りとなっております。\nご確認下さいますよう、お願い致します。\nオフィシャル商品差額分を支払う。各々の詳細は別紙をご確認ください。\nNG23@100-(税込)、KGP1@100-(税込)、LG48@100-(税込)、CBSPW@100-(税込）\nHG@300-(税込)、KU9@300-(税込)、KUS1@300-(税込)、OEMアパレル＠10%'),
  (1, 'zenkoren', 120, '全硬連', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (1, 'khanki', 130, '極真半期（道着・帯）', NULL, NULL, NULL, NULL, NULL, NULL, NULL);

INSERT INTO msroyitem (id, org, grp, seq, name, size, color, gcodes, cond, price, price2, price3, price4, rate, memo) VALUES
  (1, 'kenbu', NULL, 10, 'NG23　極真拳武會ｽｰﾊﾟｰ拳ｻﾎﾟｰﾀｰ', NULL, NULL, 'NG23-*-KEN', NULL, 100, NULL, NULL, NULL, NULL, NULL),
  (1, 'kenbu', NULL, 20, 'HG　　極真拳武會 ﾍｯﾄﾞｶﾞｰﾄﾞ', NULL, NULL, 'HG-*-WH-KEN', NULL, 300, NULL, NULL, NULL, NULL, NULL),
  (1, 'kenbu', NULL, 30, 'KGP1　極真拳武會 ニーガード', NULL, NULL, 'KGP1-*-KEN', NULL, 100, NULL, NULL, NULL, NULL, NULL),
  (1, 'kenbu', NULL, 40, 'LG48　極真拳武會 ﾍﾞﾛｸﾛﾚｯｸﾞｻﾎﾟｰﾀｰ', NULL, NULL, 'LG48-*-KEN', NULL, 100, NULL, NULL, NULL, NULL, NULL),
  (1, 'kenbu', NULL, 50, 'GG51  極真拳武會 ﾌｧｰﾙｶｯﾌﾟ', NULL, NULL, 'GG51-*-KEN', NULL, 100, NULL, NULL, NULL, NULL, NULL),
  (1, 'kenbu', NULL, 60, 'CBSPW 極真拳武會帯留', NULL, NULL, 'CBSPW-*-KEN', NULL, 100, NULL, NULL, NULL, NULL, NULL),
  (1, 'kenbu', NULL, 70, 'KU9　 高級純白フルコンタクト空手着', NULL, NULL, 'KU9-*-KEN', NULL, 300, NULL, NULL, NULL, NULL, NULL),
  (1, 'kenbu', NULL, 80, 'KUS1  純白ストレッチフルコンタクト空手着', NULL, NULL, 'KUS1-*-KEN', NULL, 300, NULL, NULL, NULL, NULL, NULL),
  (1, 'zenkoren', 'NGKO', 10, '全硬連 拳サポーター', NULL, NULL, 'NGKO-*', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (1, 'zenkoren', 'LG48', 20, '全硬連・レッグサポーター', NULL, NULL, 'LG48-*-KS', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (1, 'zenkoren', 'NG-IKG', 30, 'インナーナックルガード', NULL, NULL, 'NG-IKG', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (1, 'zenkoren', 'HGKP3', 40, 'K-ﾌﾟﾛﾃｸﾀｰﾍｯﾄﾞｶﾞｰﾄﾞ 白', NULL, NULL, 'HGKP3-*-WH', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (1, 'zenkoren', 'BPKP', 50, 'K-ﾎﾞﾃﾞｨﾌﾟﾛﾃｸﾀｰ', NULL, NULL, 'BPKP-*-BURD', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (1, 'khanki', 'dogi', 10, '道着上下', NULL, NULL, 'KU*', NULL, 1000, NULL, NULL, NULL, NULL, NULL),
  (1, 'khanki', 'dogi', 20, '道着上のみ', NULL, NULL, 'KU*-U', NULL, 600, NULL, NULL, NULL, NULL, NULL),
  (1, 'khanki', 'dogi', 30, '道着下のみ', NULL, NULL, 'KU*-S', NULL, 400, NULL, NULL, NULL, NULL, NULL),
  (1, 'khanki', 'obi', 40, '帯', NULL, NULL, 'CB*', NULL, 100, NULL, NULL, NULL, NULL, NULL);

INSERT INTO msroymem (id, org, kind, seq, aseq, mcode, eda, pcode, name, memo) VALUES
  (1, 'khanki', 'exclude', 1, NULL, '88314', NULL, NULL, NULL, '現行の SQL で除いていた納品先'),
  (1, 'khanki', 'exclude', 2, NULL, '25370', NULL, NULL, NULL, '現行の SQL で除いていた納品先');
