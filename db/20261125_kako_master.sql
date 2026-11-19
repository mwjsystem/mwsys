-- =====================================================================
-- 加工マスタ（刺繍・プリントの内容を、商品グループ・顧客・パターンごとに覚えておく）と、展開伝票からの加工指示
--
--   mskako      : 加工マスタの見出し。キーは 商品グループコード grpcode・顧客コード mcode・パターン番号 ptn
--                 （展開伝票から作る加工は、顧客コードを 'TENKAI' にする。顧客マスタには登録しない）
--   mskakoposi  : 加工マスタの位置と内容（加工指示の trkakoposi と同じ項目）
--   trkako.tdenno : 展開伝票から作った加工指示の展開伝票番号（受注伝票から作ったものは null）
--
--   受注伝票の明細で商品を入れたとき、その商品グループ・受注の顧客で加工マスタがあれば、在庫種別を
--   マスタの種類（6 刺繍依頼 / 7 プリント）にする。
--
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する。
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

CREATE TABLE IF NOT EXISTS mskako (
  id smallint NOT NULL,
  grpcode text NOT NULL,
  mcode text NOT NULL,
  ptn smallint NOT NULL,
  ptname text,
  kind text NOT NULL DEFAULT '6',
  dtype text,
  dcode text,
  naiyo text,
  memo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  PRIMARY KEY (id, grpcode, mcode, ptn)
);
COMMENT ON TABLE mskako IS '加工マスタ（商品グループ・顧客・パターンごとの刺繍・プリントの内容）';
COMMENT ON COLUMN mskako.grpcode IS '商品グループコード';
COMMENT ON COLUMN mskako.mcode IS '顧客コード（展開伝票から作る加工は TENKAI）';
COMMENT ON COLUMN mskako.ptn IS 'パターン番号（同じ商品グループ・顧客で 1, 2, 3 …）';
COMMENT ON COLUMN mskako.ptname IS 'パターンの名前（例: 名前入り、ロゴのみ）';
COMMENT ON COLUMN mskako.kind IS '種類（受注明細区分 jmeikbn: 6 刺繍依頼 / 7 プリント）';
COMMENT ON COLUMN mskako.dtype IS 'いつもの加工先の種類（S 倉庫 / V 仕入先）';
COMMENT ON COLUMN mskako.dcode IS 'いつもの加工先（倉庫コード / 仕入先コード）';
CREATE INDEX IF NOT EXISTS mskako_mcode ON mskako (id, mcode);

CREATE TABLE IF NOT EXISTS mskakoposi (
  id smallint NOT NULL,
  grpcode text NOT NULL,
  mcode text NOT NULL,
  ptn smallint NOT NULL,
  line integer NOT NULL,
  posi text,
  naiyo text,
  shotai text,
  color text,
  size text,
  memo text,
  img text,
  PRIMARY KEY (id, grpcode, mcode, ptn, line),
  FOREIGN KEY (id, grpcode, mcode, ptn) REFERENCES mskako (id, grpcode, mcode, ptn) ON DELETE CASCADE ON UPDATE CASCADE
);
COMMENT ON TABLE mskakoposi IS '加工マスタの位置と内容（位置・文字・書体・糸色・サイズ・刺繍の図）';

ALTER TABLE trkako ADD COLUMN IF NOT EXISTS tdenno integer;
COMMENT ON COLUMN trkako.tdenno IS '展開伝票番号（展開伝票から作った加工指示）';
CREATE INDEX IF NOT EXISTS trkako_tdenno ON trkako (id, tdenno);

-- ---------------------------------------------------------------------
-- Hasura 側の設定（1 つずつ保存する。続けて保存すると Hasura が落ちることがある）
--   ・mskako・mskakoposi を Track する
--   ・リレーション: mskako → mskakoposis（mskakoposi の配列。外部キーの候補のまま追加）
--   ・staff の権限: 2 つとも select / insert / update / delete（全部の列）
--   ・trkako の staff の select / insert / update に tdenno を足す
-- ---------------------------------------------------------------------
