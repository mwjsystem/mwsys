-- =====================================================================
-- 受注伝票の出荷指示（NAS への出荷指示フォルダの作成・倉庫での出力）と受注ステータスの作り直し
--
--   1. trjyuden に列を追加する
--        denku    : 伝票区分（0 通常 / 2 返品）。これまで移行データでは jdstatus に入れていた現行の denku を移す
--        shipdir  : 出荷指示フォルダ（NAS の保存先フォルダからの相対パス。例: 20261029出荷分/前田担当分/3622151_石神里幸様）
--        ship_at / ship_by   : 出荷指示フォルダを作成した日時・担当者
--        print_at / print_by : 倉庫で出荷指示を出力（印刷）した日時・担当者
--   2. 受注ステータス（jdstatus。分類マスタ kubun = 'jdstatus'）を作り直す
--        0 未保存 / 1 仮受注 / 2 受注登録 / 3 出荷指示フォルダ作成済 / 4 出荷指示出力済 / 6 完了 / 9 取消
--        （入金待・請求済・一部入金済は、伝票の「請求済」の表示と入金残高で分かるので外す）
--   3. 既存の受注伝票: jdstatus の 0/2（現行の denku）を denku に移し、
--      jdstatus を、出荷予定日（sday）が今日より前なら 4 出荷指示出力済、それ以外は 2 受注登録にする
--      （このファイルを実行した時点のデータに対してだけ。以降の移行では migration/02_after_load.sql が同じことをする）
--   4. 受注伝票の操作の記録（trjyuden_opelog）に、出荷指示フォルダ作成・出荷指示出力を残す
--
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する。
--           3 は受注伝票の全件を更新するので、本番（public）では少し時間がかかる（数十秒）。
--           Hasura の画面が 30 秒で切れても、DB では処理が続くので、もう一度実行しないこと
--           （下の確認用 SQL で終わったかを確かめる）。
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

-- 1. 列の追加
ALTER TABLE trjyuden ADD COLUMN IF NOT EXISTS denku smallint NOT NULL DEFAULT 0;
ALTER TABLE trjyuden ADD COLUMN IF NOT EXISTS shipdir text;
ALTER TABLE trjyuden ADD COLUMN IF NOT EXISTS ship_at timestamptz;
ALTER TABLE trjyuden ADD COLUMN IF NOT EXISTS ship_by text;
ALTER TABLE trjyuden ADD COLUMN IF NOT EXISTS print_at timestamptz;
ALTER TABLE trjyuden ADD COLUMN IF NOT EXISTS print_by text;
COMMENT ON COLUMN trjyuden.denku IS '伝票区分（0 通常 / 2 返品）';
COMMENT ON COLUMN trjyuden.shipdir IS '出荷指示フォルダ（NAS の保存先フォルダからの相対パス）';
COMMENT ON COLUMN trjyuden.ship_at IS '出荷指示フォルダの作成日時';
COMMENT ON COLUMN trjyuden.ship_by IS '出荷指示フォルダの作成者（担当者コード）';
COMMENT ON COLUMN trjyuden.print_at IS '出荷指示の出力（倉庫で印刷）日時';
COMMENT ON COLUMN trjyuden.print_by IS '出荷指示の出力者（担当者コード）';

-- 受注一覧（出荷予定日で絞り込む）用の索引
CREATE INDEX IF NOT EXISTS trjyuden_sday_idx ON trjyuden (id, sday) WHERE NOT del;

-- 2. 分類マスタ
DELETE FROM msbunrui WHERE id = 1 AND kubun = 'jdstatus';
INSERT INTO msbunrui (id, kubun, value, viewval) VALUES
  (1, 'jdstatus', '0', '未保存'),
  (1, 'jdstatus', '1', '仮受注'),
  (1, 'jdstatus', '2', '受注登録'),
  (1, 'jdstatus', '3', '出荷指示フォルダ作成済'),
  (1, 'jdstatus', '4', '出荷指示出力済'),
  (1, 'jdstatus', '6', '完了'),
  (1, 'jdstatus', '9', '取消');

-- 3. 既存の受注伝票（操作の記録には残さない）
ALTER TABLE trjyuden DISABLE TRIGGER trjyuden_opelog;
UPDATE trjyuden
   SET denku = CASE WHEN jdstatus = '2' THEN 2 ELSE 0 END,
       jdstatus = CASE WHEN sday < current_date THEN '4' ELSE '2' END
 WHERE jdstatus IS NULL OR jdstatus IN ('0', '2');
ALTER TABLE trjyuden ENABLE TRIGGER trjyuden_opelog;

-- 4. 操作の記録
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

  -- 出荷指示フォルダの作成／倉庫での出力（受注伝票の保存とは別に、受注一覧・出荷指示印刷の画面から更新される）
  IF NEW.ship_at IS DISTINCT FROM OLD.ship_at AND NEW.ship_at IS NOT NULL THEN
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.mcode, '1', '出荷指示フォルダ作成 ' || coalesce(NEW.shipdir, ''), NEW.ship_by);
  END IF;
  IF NEW.print_at IS DISTINCT FROM OLD.print_at AND NEW.print_at IS NOT NULL THEN
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.mcode, '1', '出荷指示出力 ' || coalesce(NEW.shipdir, ''), NEW.print_by);
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
                           'shipdir', 'ship_at', 'ship_by', 'print_at', 'print_by')
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
-- 確認用（3 が終わったか）: 返品の件数と、ステータスごとの件数
--   SELECT denku, jdstatus, count(*) FROM trjyuden GROUP BY 1, 2 ORDER BY 1, 2;
--   jdstatus が 2 と 4 だけ（と 9 など画面で付けたもの）になっていれば完了
-- ---------------------------------------------------------------------
-- Hasura 側の設定
--   ・Data > trjyuden > Modify で「Reload」（または Settings > Reload metadata）して新しい列を認識させる
--   ・trjyuden の select / update / insert 権限（staff）に denku, shipdir, ship_at, ship_by, print_at, print_by を含める
--     （jdstatus も select / update / insert に含まれていること）
-- ---------------------------------------------------------------------
