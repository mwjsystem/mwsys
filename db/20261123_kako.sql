-- =====================================================================
-- 加工指示（刺繍・プリント）: 表・連番・操作ログ（養父刺繍依頼一覧.xlsx の置き換え）
--
--   trkako      : 加工指示の見出し（1 枚の指示書）。受注伝票から作る。加工先は倉庫（dtype='S'、倉庫コード）か仕入先（dtype='V'、仕入先コード）
--   trkakomei   : 加工する商品（受注明細から引き継ぐ。品番・数量）
--   trkakoposi  : 加工の位置と内容（位置・文字・書体・糸色・サイズ。数は自由）
--
--   状態 status: 1 依頼 / 2 倉庫から加工先へ発送 / 3 加工先で受取 / 4 加工済・発送 / 5 倉庫で受取 / 6 出荷済
--                各段階の日時と担当者を s2_at・s2_by … s6_at・s6_by に残す
--   連番 renban: 加工先ごと・依頼日の月ごとの通し番号（例: 11-003）。登録したときにトリガーで付ける（内勤・倉庫・加工場で共有する番号）
--   操作ログ: extype = '9'（加工依頼）。登録・状態・項目の変更を tropelog に記録する
--
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する。
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

CREATE TABLE IF NOT EXISTS trkako (
  id smallint NOT NULL,
  kno integer NOT NULL,
  jdenno integer,
  mcode text,
  mname text,
  kind text NOT NULL DEFAULT '6',
  dtype text NOT NULL DEFAULT 'S',
  dcode text NOT NULL,
  rscode text,
  kym text NOT NULL,
  kseq integer NOT NULL,
  renban text NOT NULL,
  tcode text NOT NULL,
  reqday date NOT NULL,
  wishday date,
  planday date,
  doukon boolean NOT NULL DEFAULT false,
  naiyo text,
  memo text,
  status smallint NOT NULL DEFAULT 1,
  s2_at timestamptz, s2_by text,
  s3_at timestamptz, s3_by text,
  s4_at timestamptz, s4_by text,
  s5_at timestamptz, s5_by text,
  s6_at timestamptz, s6_by text,
  del boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  PRIMARY KEY (id, kno)
);
COMMENT ON TABLE trkako IS '加工指示（刺繍・プリント）';
COMMENT ON COLUMN trkako.kind IS '種類（受注明細区分 jmeikbn: 6 刺繍依頼 / 7 プリント）';
COMMENT ON COLUMN trkako.dtype IS '加工先の種類（S 倉庫 / V 仕入先）';
COMMENT ON COLUMN trkako.dcode IS '加工先（倉庫コード / 仕入先コード）';
COMMENT ON COLUMN trkako.rscode IS '納品場所（加工後に戻す倉庫）';
COMMENT ON COLUMN trkako.renban IS '連番（加工先ごと・月ごと。例 11-003）';
COMMENT ON COLUMN trkako.status IS '1 依頼 / 2 倉庫から発送 / 3 加工先で受取 / 4 加工済・発送 / 5 倉庫で受取 / 6 出荷済';
COMMENT ON COLUMN trkako.doukon IS '同梱あり';
CREATE UNIQUE INDEX IF NOT EXISTS trkako_renban ON trkako (id, dtype, dcode, kym, kseq);
CREATE INDEX IF NOT EXISTS trkako_jdenno ON trkako (id, jdenno);
CREATE INDEX IF NOT EXISTS trkako_reqday ON trkako (id, reqday);

CREATE TABLE IF NOT EXISTS trkakomei (
  id smallint NOT NULL,
  kno integer NOT NULL,
  line integer NOT NULL,
  jline integer,
  gcode text NOT NULL,
  gtext text,
  suu integer NOT NULL DEFAULT 0,
  memo text,
  PRIMARY KEY (id, kno, line),
  FOREIGN KEY (id, kno) REFERENCES trkako (id, kno) ON DELETE CASCADE
);
COMMENT ON TABLE trkakomei IS '加工指示の商品';

CREATE TABLE IF NOT EXISTS trkakoposi (
  id smallint NOT NULL,
  kno integer NOT NULL,
  line integer NOT NULL,
  posi text,
  naiyo text,
  shotai text,
  color text,
  size text,
  memo text,
  PRIMARY KEY (id, kno, line),
  FOREIGN KEY (id, kno) REFERENCES trkako (id, kno) ON DELETE CASCADE
);
COMMENT ON TABLE trkakoposi IS '加工指示の位置と内容（位置・文字・書体・糸色・サイズ）';

-- ---------------------------------------------------------------------
-- 採番（加工指示番号）
-- ---------------------------------------------------------------------
INSERT INTO trnumber (id, type, curnum, memo)
SELECT c.id, 'kakono', 0, '加工指示番号'
  FROM (SELECT DISTINCT id FROM trnumber) c
 WHERE NOT EXISTS (SELECT 1 FROM trnumber n WHERE n.id = c.id AND n.type = 'kakono');

-- ---------------------------------------------------------------------
-- 連番（加工先ごと・依頼日の月ごと）。登録のとき、加工先か依頼日の月を変えたときに付け直す
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trkako_renban() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.dtype = OLD.dtype AND NEW.dcode = OLD.dcode
     AND to_char(NEW.reqday, 'YYYYMM') = OLD.kym THEN
    NEW.kym := OLD.kym;
    NEW.kseq := OLD.kseq;
    NEW.renban := OLD.renban;
    RETURN NEW;
  END IF;
  NEW.kym := to_char(NEW.reqday, 'YYYYMM');
  -- 同じ加工先・月の番号を同時に付けないよう、トランザクションの終わりまで待たせる
  PERFORM pg_advisory_xact_lock(hashtext('trkako:' || NEW.id || ':' || NEW.dtype || ':' || NEW.dcode || ':' || NEW.kym));
  SELECT coalesce(max(k.kseq), 0) + 1 INTO NEW.kseq
    FROM trkako k
   WHERE k.id = NEW.id AND k.dtype = NEW.dtype AND k.dcode = NEW.dcode AND k.kym = NEW.kym;
  NEW.renban := to_char(NEW.reqday, 'FMMM') || '-' || lpad(NEW.kseq::text, 3, '0');
  RETURN NEW;
END
$$ LANGUAGE plpgsql
SET search_path FROM CURRENT;

DROP TRIGGER IF EXISTS trkako_renban ON trkako;
CREATE TRIGGER trkako_renban
  BEFORE INSERT OR UPDATE ON trkako
  FOR EACH ROW EXECUTE FUNCTION trkako_renban();

-- ---------------------------------------------------------------------
-- 操作ログ（tropelog、extype = '9' 加工依頼。keycode = 加工指示番号）
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trkako_opelog() RETURNS trigger AS $$
DECLARE
  r jsonb;
  o jsonb;
  k text;
  parts text[] := '{}';
  v_o text;
  v_n text;
  v_memo text;
  v_names text[] := ARRAY['依頼', '倉庫から発送', '加工先で受取', '加工済・発送', '倉庫で受取', '出荷済'];
  v_skip text[] := ARRAY['id', 'kno', 'kym', 'kseq', 'renban', 'status', 'created_at', 'created_by', 'updated_at', 'updated_by',
                         's2_at', 's2_by', 's3_at', 's3_by', 's4_at', 's4_by', 's5_at', 's5_by', 's6_at', 's6_by'];
  v_label text;
BEGIN
  r := to_jsonb(NEW);
  IF TG_OP = 'INSERT' THEN
    v_memo := '加工依頼 登録 連番=' || NEW.renban || ' 加工先=' || NEW.dcode || ' 受注=' || coalesce(NEW.jdenno::text, '')
              || ' 依頼日=' || NEW.reqday || coalesce(' 希望納期=' || NEW.wishday, '') || coalesce(' ' || NEW.naiyo, '');
  ELSE
    o := to_jsonb(OLD);
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      parts := parts || ('状態 ' || coalesce(v_names[OLD.status], OLD.status::text) || '→' || coalesce(v_names[NEW.status], NEW.status::text));
    END IF;
    FOR k IN SELECT jsonb_object_keys(r) ORDER BY 1 LOOP
      CONTINUE WHEN k = ANY (v_skip);
      v_o := nullif(o->>k, '');
      v_n := nullif(r->>k, '');
      CONTINUE WHEN v_o IS NOT DISTINCT FROM v_n;
      v_label := CASE k WHEN 'jdenno' THEN '受注' WHEN 'mcode' THEN '顧客' WHEN 'mname' THEN '顧客名' WHEN 'kind' THEN '種類'
        WHEN 'dtype' THEN '加工先の種類' WHEN 'dcode' THEN '加工先' WHEN 'rscode' THEN '納品場所' WHEN 'tcode' THEN '内勤'
        WHEN 'reqday' THEN '依頼日' WHEN 'wishday' THEN '希望納期' WHEN 'planday' THEN '予定納期' WHEN 'doukon' THEN '同梱'
        WHEN 'naiyo' THEN '加工内容' WHEN 'memo' THEN '備考' WHEN 'del' THEN '取消' ELSE k END;
      parts := parts || (v_label || ' ' || coalesce(v_o, '(空)') || '→' || coalesce(v_n, '(空)'));
    END LOOP;
    IF NEW.renban IS DISTINCT FROM OLD.renban THEN
      parts := parts || ('連番 ' || OLD.renban || '→' || NEW.renban);
    END IF;
    IF array_length(parts, 1) IS NULL THEN
      v_memo := '加工依頼 変更（明細）';
    ELSE
      v_memo := '加工依頼 変更: ' || array_to_string(parts, ', ');
    END IF;
  END IF;
  INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
  VALUES (NEW.id, NEW.kno::text, NEW.jdenno::text, '9', left(v_memo, 2000), coalesce(NEW.updated_by, NEW.created_by, ''));
  RETURN NULL;
END
$$ LANGUAGE plpgsql
SET search_path FROM CURRENT;  -- test の加工指示は test.tropelog に書く（実行時の search_path は public のため）

DROP TRIGGER IF EXISTS trkako_opelog ON trkako;
CREATE TRIGGER trkako_opelog
  AFTER INSERT OR UPDATE ON trkako
  FOR EACH ROW EXECUTE FUNCTION trkako_opelog();

-- ---------------------------------------------------------------------
-- Hasura 側の設定
--   ・trkako・trkakomei・trkakoposi を Track する
--   ・リレーション: trkako → trkakomeis（trkakomei の配列）・trkakoposis（trkakoposi の配列）
--     （外部キーがあるので、Track したときの候補の名前のまま追加すれば、この名前になる）
--   ・staff の権限: 3 つとも select / insert / update / delete（全部の列。trkako の kym・kseq・renban はトリガーが入れる）
-- ---------------------------------------------------------------------
