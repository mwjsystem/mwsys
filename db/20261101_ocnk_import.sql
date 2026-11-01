-- =====================================================================
-- おちゃのこ受注取込（現行の「BTC-MWWEB.xlsm」と member.xlsx の置き換え）
--
--   mswebhaiso  : 発送方法の変換表（File シートの OCNK）。名称 → 大分類・部門・担当・税区分・媒体管理
--   mswebpay    : 支払方法の変換表（File シートの PayType）。名称 → 入金予定コード
--   mswebtime   : お届け時間帯の変換表（File シートの Time）。名称 → 時間コード
--   msmember.webid : おちゃのこの会員ID。1 人で複数持つ顧客はカンマ区切りで入れる（例 12345,12346）
--
--   member.xlsx の会員ID は別ファイルの 20261101_msmember_webid_*.sql で msmember に入れる。
--
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する。
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

COMMENT ON COLUMN msmember.webid IS 'おちゃのこ会員ID（複数はカンマ区切り）';

CREATE TABLE IF NOT EXISTS mswebhaiso (
    id        smallint NOT NULL
  , hname     text     NOT NULL
  , shop      text
  , daibunrui text
  , bumon     text
  , tanto     text
  , mtax      text
  , bkcode    text
  , PRIMARY KEY (id, hname)
);
ALTER TABLE mswebhaiso ADD COLUMN IF NOT EXISTS hcode text;
ALTER TABLE mswebhaiso ADD COLUMN IF NOT EXISTS hcoded text;
COMMENT ON COLUMN mswebhaiso.hcode IS '配送方法（mshokuri.code）。空なら受注伝票の配送方法も空のまま';
COMMENT ON COLUMN mswebhaiso.hcoded IS '代引のときの配送方法（mshokuri.code）';
CREATE TABLE IF NOT EXISTS mswebpay (
    id    smallint NOT NULL
  , pname text     NOT NULL
  , pcode text     NOT NULL
  , PRIMARY KEY (id, pname)
);
CREATE TABLE IF NOT EXISTS mswebtime (
    id    smallint NOT NULL
  , tname text     NOT NULL
  , code  text     NOT NULL
  , PRIMARY KEY (id, tname)
);

INSERT INTO mswebhaiso (id, hname, shop, daibunrui, bumon, tanto, mtax, bkcode) VALUES
    (1, '基本送料', 'MWJonline', '200001', '201', '3117', '1', '01')
  , (1, 'サプリメント', 'MWJonline', '200001', '201', '3117', '1', '01')
  , (1, '送料別途ご連絡', 'MWJonline', '200001', '201', '3117', '1', '01')
  , (1, '宅配便', 'ALMAWeb', '200001', '202', '3114', '1', '08')
  , (1, 'NAS会員', 'MWJonline', '333333', '092', '3106', '1', '10')
ON CONFLICT DO NOTHING;

-- 同梱：受注伝票の配送方法を mshokuri の 49「**同梱」（代引は 45「**同梱代」）にする。大分類などは基本送料と同じ
INSERT INTO mswebhaiso (id, hname, shop, daibunrui, bumon, tanto, mtax, bkcode, hcode, hcoded) VALUES
    (1, '同梱', 'MWJonline', '200001', '201', '3117', '1', '01', '49', '45')
ON CONFLICT (id, hname) DO UPDATE SET hcode = EXCLUDED.hcode, hcoded = EXCLUDED.hcoded;

INSERT INTO mswebpay (id, pname, pcode) VALUES
    (1, '銀行振込', '5')
  , (1, '銀行振込（入金確認後発送）', '5')
  , (1, '銀行振込（振込先連絡後振込依頼）', '5')
  , (1, '郵便振替', '5')
  , (1, 'イプシロン クレジットカード払い', '7')
  , (1, 'ポイント全額払い', '7')
  , (1, 'SGシステムクレジットカード払い', '7')
  , (1, 'クレジットカード（金額確定メール受信後決済）', '7')
  , (1, '代金引換', '9')
  , (1, 'イプシロン コンビニ払い', '11')
ON CONFLICT DO NOTHING;

INSERT INTO mswebtime (id, tname, code) VALUES
    (1, '12時～14時', '12')
  , (1, '14時～16時', '14')
  , (1, '16時～18時', '16')
  , (1, '18時～20時', '18')
  , (1, '18時～21時', '4')
  , (1, '19時～21時', '19')
  , (1, '午前中', '1')
ON CONFLICT DO NOTHING;

-- 二重登録の確認を速くする
CREATE INDEX IF NOT EXISTS trjyuden_cusden_idx ON trjyuden (id, cusden);
-- 会員ID で顧客を探す
CREATE INDEX IF NOT EXISTS msmember_webid_idx ON msmember (id, webid);

-- ---------------------------------------------------------------------
-- Hasura 側の設定
--   ・Reload metadata
--   ・表 mswebhaiso, mswebpay, mswebtime を Track する
--   ・mswebhaiso, mswebpay, mswebtime の select 権限（staff）: すべての列
--   ・msmember の select 権限（staff）に webid, tcode, tcode1, torikbn が含まれていること
--   ・trzaiko の update 権限（staff）に jyut が含まれていること
--   ・msgzai の select 権限（staff）に gcode, zcode, irisu が含まれていること
-- ---------------------------------------------------------------------
