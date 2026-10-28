-- =====================================================================
-- 請求書（PDF）出力に必要な項目の追加
--
--   ・msmember.seikyuu : 請求書区分（現行システムの顧客マスタ seikyuu。振込先口座・差出メールを決める）
--   ・mssystem         : 請求書に載せる会社情報（正式社名・登録番号・住所・電話・FAX・振込先銀行・口座名義）
--   ・msskoza（新規）   : 請求書区分 → 振込先口座・差出メールの対応表
--
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する（すぐ終わる）。
--   実行後、Hasura で msskoza を Track し、権限を設定する（末尾の注記参照）。
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

-- 1. 顧客マスタ: 請求書区分
--    データ移行（work/移行用SQL/member.sql・member2.sql）では、抽出の最後の列に m.seikyuu を追加すること
--    （列の追加は表の末尾なので、CSV の最後の列が seikyuu になる）
ALTER TABLE msmember ADD COLUMN IF NOT EXISTS seikyuu smallint;
COMMENT ON COLUMN msmember.seikyuu IS '請求書区分（振込先口座・差出メールを msskoza.code で決める。現行システムの顧客マスタ seikyuu）';

-- 2. 会社情報（請求書の右上に載せる）
ALTER TABLE mssystem
    ADD COLUMN IF NOT EXISTS kname  text   -- 正式社名
  , ADD COLUMN IF NOT EXISTS invno  text   -- 適格請求書発行事業者の登録番号
  , ADD COLUMN IF NOT EXISTS zip    text   -- 郵便番号
  , ADD COLUMN IF NOT EXISTS adr    text   -- 住所
  , ADD COLUMN IF NOT EXISTS tel    text
  , ADD COLUMN IF NOT EXISTS fax    text
  , ADD COLUMN IF NOT EXISTS bank   text   -- 振込先の銀行・支店
  , ADD COLUMN IF NOT EXISTS kmeigi text;  -- 振込先の口座名義

UPDATE mssystem
   SET kname  = '株式会社 マーシャルワールドジャパン'
     , invno  = 'T2120001214519'
     , zip    = '541-0051'
     , adr    = '大阪市中央区備後町3-1-6 船場アルファビル2Ｆ'
     , tel    = '06-4963-2224'
     , fax    = '06-4963-2229'
     , bank   = 'りそな銀行　大阪西区支店'
     , kmeigi = '株式会社マーシャルワールドジャパン'
 WHERE id = 1;

-- 3. 請求書区分 → 振込先口座・差出メール
--    code = msmember.seikyuu の値。該当する行が無い請求先は code = '*' の行を使う
CREATE TABLE IF NOT EXISTS msskoza (
    id    smallint NOT NULL
  , code  text     NOT NULL      -- 請求書区分（'*' = 該当なしのとき）
  , koza  text     NOT NULL      -- 振込先口座（例: 普通預金 6315806）
  , mail  text                   -- 請求書メールの差出アドレス
  , memo  text
  , PRIMARY KEY (id, code)
);
COMMENT ON TABLE msskoza IS '請求書区分ごとの振込先口座・差出メール（msmember.seikyuu → code）';

INSERT INTO msskoza (id, code, koza, mail) VALUES
    (1, '6',  '普通預金  6315806', 'order-d@mwjapan.jp')
  , (1, '10', '普通預金  6315806', 'order-d@mwjapan.jp')
  , (1, '96', '普通預金  0067240', 'order-d@mwjapan.jp')
  , (1, '*',  '普通預金  6315805', 'order-h@mwjapan.jp')
ON CONFLICT (id, code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 既存データへの請求書区分の反映（データ移行の前に試したいとき）
--   1. 現行システムから抽出して CSV にする（A5:SQL Mk-2）
--        select trim(code) mcode, seikyuu from member where id = 1 and seikyuu is not null
--   2. psql で一時的な表に投入して反映する
--        CREATE TABLE tmp_seikyuu (mcode text, seikyuu smallint);
--        \copy tmp_seikyuu FROM '<CSVのパス>' with csv header;
--        UPDATE msmember m SET seikyuu = t.seikyuu FROM tmp_seikyuu t WHERE m.id = 1 AND m.mcode = t.mcode;
--        DROP TABLE tmp_seikyuu;
--   反映しない間は、全請求先が code = '*' の口座になる。
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- Hasura 側の設定
--   ・msskoza を Track し、staff 等に select 権限
--   ・mssystem の select 権限に kname, invno, zip, adr, tel, fax, bank, kmeigi を含める
--   ・msmember の select 権限に seikyuu を含める（顧客マスタ画面で変更するなら insert / update も）
-- ---------------------------------------------------------------------
