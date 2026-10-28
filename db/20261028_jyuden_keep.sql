-- =====================================================================
-- キープ表（倉庫へ FAX して在庫を確保してもらう）と、受注ステータスの 2 桁化
--
--   1. 受注ステータス（jdstatus。分類マスタ kubun = 'jdstatus'）を 2 桁にする
--        00 未保存 / 10 仮受注 / 20 受注登録 / 21 キープ表FAX済 / 22 キープ表FAX後の変更 / 23 キープ確認済 / 24 欠品 /
--        30 出荷指示フォルダ作成済 / 40 出荷指示出力済 / 50 ピッキング済 / 60 完了 / 90 取消
--      既存の受注伝票の値も置き換える（0→00, 1→10, 2→20, 3→30, 4→40, 5→50, 6→60, 9→90）
--   2. trkeep: キープ表に載せた明細（FAX したときの写し）と、倉庫で確保できた数（kpsuu）
--      受注伝票の保存では明細（trjyumei）が消して入れ直されるため、別の表に持つ
--   3. trjyuden に列を追加する
--        keep_at / keep_by   : キープ表を FAX（NAS の asago宛FAX に保存）した日時・担当者
--        kpchk_at / kpchk_by : 倉庫でキープを確認した日時・担当者
--   4. vkeepzai: 在庫照会の「キープ済」用。倉庫で確保できた数（キープ確認済・欠品で、受注伝票を直していないもの）
--   5. 受注伝票の操作の記録（trjyuden_opelog）に、キープ表FAX・キープ確認を残す
--
-- 前提: 20261028_jyuden_ship.sql / 20261028_jyuden_pick.sql を適用済み
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する。
--           1 は受注伝票の全件を更新するので、本番（public）では少し時間がかかる（数十秒）。
--           Hasura の画面が 30 秒で切れても DB では処理が続くので、もう一度実行しないこと。
--           実行後、Data > SQL の下の「Track this」で vkeepzai を追跡する（または Data 画面で Untracked から Track）。
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

-- 1. 受注ステータスの 2 桁化
DELETE FROM msbunrui WHERE id = 1 AND kubun = 'jdstatus';
INSERT INTO msbunrui (id, kubun, value, viewval) VALUES
  (1, 'jdstatus', '00', '未保存'),
  (1, 'jdstatus', '10', '仮受注'),
  (1, 'jdstatus', '20', '受注登録'),
  (1, 'jdstatus', '21', 'キープ表FAX済'),
  (1, 'jdstatus', '22', 'キープ表FAX後の変更'),
  (1, 'jdstatus', '23', 'キープ確認済'),
  (1, 'jdstatus', '24', '欠品'),
  (1, 'jdstatus', '30', '出荷指示フォルダ作成済'),
  (1, 'jdstatus', '40', '出荷指示出力済'),
  (1, 'jdstatus', '50', 'ピッキング済'),
  (1, 'jdstatus', '60', '完了'),
  (1, 'jdstatus', '90', '取消');

ALTER TABLE trjyuden DISABLE TRIGGER trjyuden_opelog;
UPDATE trjyuden SET jdstatus = jdstatus || '0' WHERE jdstatus IN ('0', '1', '2', '3', '4', '5', '6', '9');
ALTER TABLE trjyuden ENABLE TRIGGER trjyuden_opelog;

-- 2. キープ表の明細
CREATE TABLE IF NOT EXISTS trkeep (
    id         smallint NOT NULL
  , denno      integer  NOT NULL
  , line       integer  NOT NULL
  , gcode      text
  , gtext      text
  , suu        numeric
  , scode      text
  , spec       text
  , kpsuu      numeric
  , faxed_at   timestamptz
  , faxed_by   text
  , checked_at timestamptz
  , checked_by text
  , PRIMARY KEY (id, denno, line)
);
COMMENT ON TABLE trkeep IS 'キープ表に載せた受注明細（FAX したときの写し）と、倉庫で確保できた数';
COMMENT ON COLUMN trkeep.suu IS '受注数（FAX したとき）';
COMMENT ON COLUMN trkeep.kpsuu IS '倉庫で確保できた数（未確認は NULL）';
COMMENT ON COLUMN trkeep.spec IS '引当区分（FAX したとき。在庫照会の集計に使う）';

-- 3. 列の追加
ALTER TABLE trjyuden ADD COLUMN IF NOT EXISTS keep_at timestamptz;
ALTER TABLE trjyuden ADD COLUMN IF NOT EXISTS keep_by text;
ALTER TABLE trjyuden ADD COLUMN IF NOT EXISTS kpchk_at timestamptz;
ALTER TABLE trjyuden ADD COLUMN IF NOT EXISTS kpchk_by text;
COMMENT ON COLUMN trjyuden.keep_at IS 'キープ表を FAX（NAS に保存）した日時';
COMMENT ON COLUMN trjyuden.keep_by IS 'キープ表を FAX した担当者';
COMMENT ON COLUMN trjyuden.kpchk_at IS '倉庫でキープを確認した日時';
COMMENT ON COLUMN trjyuden.kpchk_by IS '倉庫でキープを確認した担当者';

-- 4. 在庫照会の「キープ済」（倉庫で確保できた数）
--    キープ確認済・欠品と、その後の出荷指示（30〜50）の受注伝票。受注伝票を直した（20・22）ものは含めない
--    引当区分が引当の明細（1, 2, 4, 5, 6）だけ（在庫照会の引当済から差し引くため）
CREATE OR REPLACE VIEW vkeepzai AS
SELECT k.id, k.denno, k.line, k.gcode, k.scode, k.spec, k.kpsuu AS suu, j.sday, coalesce(j.del, false) AS del
  FROM trkeep k
  JOIN trjyuden j ON j.id = k.id AND j.denno = k.denno
 WHERE k.kpsuu > 0
   AND k.spec IN ('1', '2', '4', '5', '6')
   AND j.jdstatus IN ('23', '24', '30', '40', '50');
COMMENT ON VIEW vkeepzai IS '在庫照会のキープ済: 倉庫で確保できた数（キープ確認済・欠品〜ピッキング済の受注伝票）';

-- 5. 操作の記録
CREATE OR REPLACE FUNCTION trjyuden_opelog() RETURNS trigger AS $$
DECLARE
  -- 列名（tropelog.memo など）と区別するため v_ を付ける
  v_cols text;
  v_memo text;
  v_who  text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.mcode, '1',
            '受注登録 受注先=' || coalesce(NEW.mcode, '') || ' 請求先=' || coalesce(NEW.scde, '') || ' 合計=' || coalesce(NEW.total, 0),
            NEW.created_by);
    RETURN NULL;
  END IF;

  -- 請求計上／請求解除（0 と NULL の間の変更は記録しない）
  IF coalesce(NEW.idenno, 0) IS DISTINCT FROM coalesce(OLD.idenno, 0) THEN
    IF coalesce(NEW.idenno, 0) > 0 THEN
      SELECT s.created_by INTO v_who FROM trseikyu s WHERE s.id = NEW.id AND s.denno = NEW.idenno;
      v_memo := '請求計上 請求伝票=' || NEW.idenno;
    ELSE
      SELECT s.updated_by INTO v_who FROM trseikyu s WHERE s.id = OLD.id AND s.denno = OLD.idenno;
      v_memo := '請求解除 請求伝票=' || OLD.idenno;
    END IF;
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.mcode, '1', v_memo, v_who);
  END IF;

  -- キープ表・出荷指示の各段階（受注伝票の保存とは別に、出荷の画面から更新される）
  IF NEW.keep_at IS DISTINCT FROM OLD.keep_at AND NEW.keep_at IS NOT NULL THEN
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.mcode, '1', 'キープ表FAX', NEW.keep_by);
  END IF;
  IF NEW.kpchk_at IS DISTINCT FROM OLD.kpchk_at AND NEW.kpchk_at IS NOT NULL THEN
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.mcode, '1',
            CASE WHEN NEW.jdstatus = '24' THEN 'キープ確認（欠品あり）' ELSE 'キープ確認' END, NEW.kpchk_by);
  END IF;
  IF NEW.ship_at IS DISTINCT FROM OLD.ship_at AND NEW.ship_at IS NOT NULL THEN
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.mcode, '1', '出荷指示フォルダ作成 ' || coalesce(NEW.shipdir, ''), NEW.ship_by);
  END IF;
  IF NEW.print_at IS DISTINCT FROM OLD.print_at AND NEW.print_at IS NOT NULL THEN
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.mcode, '1', '出荷指示出力 ' || coalesce(NEW.shipdir, ''), NEW.print_by);
  END IF;
  IF NEW.pick_at IS DISTINCT FROM OLD.pick_at AND NEW.pick_at IS NOT NULL THEN
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.mcode, '1', 'ピッキング完了', NEW.pick_by);
  END IF;

  -- 画面からの保存・取消・取消解除
  IF NEW.updated_at IS DISTINCT FROM OLD.updated_at OR coalesce(NEW.del, false) IS DISTINCT FROM coalesce(OLD.del, false) THEN
    IF coalesce(NEW.del, false) AND NOT coalesce(OLD.del, false) THEN
      v_memo := '受注取消';
    ELSIF NOT coalesce(NEW.del, false) AND coalesce(OLD.del, false) THEN
      v_memo := '受注取消解除';
    ELSE
      SELECT string_agg(n.key, ',' ORDER BY n.key) INTO v_cols
        FROM jsonb_each(to_jsonb(NEW)) n
       WHERE n.key NOT IN ('updated_at', 'updated_by', 'created_at', 'created_by', 'idenno',
                           'shipdir', 'ship_at', 'ship_by', 'print_at', 'print_by', 'pick_at', 'pick_by',
                           'keep_at', 'keep_by', 'kpchk_at', 'kpchk_by')
         AND n.value IS DISTINCT FROM (to_jsonb(OLD) -> n.key);
      v_memo := '受注変更' || CASE WHEN v_cols IS NULL THEN '（ヘッダの変更なし）' ELSE ' 項目=' || v_cols END
             || CASE WHEN NEW.total IS DISTINCT FROM OLD.total
                     THEN ' 合計=' || coalesce(OLD.total, 0) || '→' || coalesce(NEW.total, 0) ELSE '' END;
    END IF;
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.mcode, '1', v_memo, NEW.updated_by);
  END IF;
  RETURN NULL;
END
$$ LANGUAGE plpgsql
SET search_path FROM CURRENT;  -- test の受注伝票は test.tropelog / test.trseikyu を見る（実行時の search_path は public のため）

-- ---------------------------------------------------------------------
-- 確認用: SELECT jdstatus, count(*) FROM trjyuden GROUP BY 1 ORDER BY 1;  （2 桁だけになっていること）
-- Hasura 側の設定
--   ・Reload metadata。trkeep と vkeepzai を Track する
--   ・trjyuden の select / update 権限（staff）に keep_at, keep_by, kpchk_at, kpchk_by を含める
--   ・trkeep の select / insert / update / delete 権限（staff）: すべての列、行の条件なし（他の表と同じ）
--   ・vkeepzai の select 権限（staff）: すべての列。集計（aggregate）も許可する
-- ---------------------------------------------------------------------
