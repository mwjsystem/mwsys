-- =====================================================================
-- 海外入荷チェック（現行の「海外入荷チェックリスト.xlsm」を印刷して紙でチェックしていたものの置き換え）
--
--   倉庫のスマホ（/frmsiire/check）で、仕入伝票番号を指定して仕入明細を出し、入荷した箱のラベルをカメラで撮って
--   文字認識（PO 番号＝発注番号・品番・数量）で明細を探し、箱ごとに数量を足し込んでいく。
--
--   1. trsiichk（新しい表）: 仕入明細ごとに、倉庫で数えた数量・箱数
--        仕入伝票の保存では明細（trsiimei）が消して入れ直されるため、別の表に持つ（キープの trkeep と同じ）
--        複数のスマホで同じ伝票を分けて数えられるよう、画面は数を足す（_inc）だけで書く
--   2. trsiiden に列を追加する
--        chk_at / chk_by / chkmemo : 倉庫で入荷チェックを完了した日時・担当者・内容（数量が合わなかった明細など）
--   3. 仕入伝票の操作の記録（trsiiden_opelog）に「入荷チェック」を残す。チェックの更新は「仕入変更」として記録しない
--
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する。
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

-- 1. 倉庫で数えた数量（仕入明細ごと）
CREATE TABLE IF NOT EXISTS trsiichk (
  id smallint NOT NULL,
  denno integer NOT NULL,
  line integer NOT NULL,
  chksuu numeric NOT NULL DEFAULT 0,
  chkbox integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  PRIMARY KEY (id, denno, line)
);
COMMENT ON TABLE trsiichk IS '入荷チェック: 仕入明細ごとに倉庫で数えた数量・箱数（スマホの /frmsiire/check）';
COMMENT ON COLUMN trsiichk.denno IS '仕入伝票番号';
COMMENT ON COLUMN trsiichk.line IS '仕入明細の行番号';
COMMENT ON COLUMN trsiichk.chksuu IS '倉庫で数えた数量（箱の数量の合計）';
COMMENT ON COLUMN trsiichk.chkbox IS '倉庫で数えた箱数';
COMMENT ON COLUMN trsiichk.updated_by IS '最後に数えた担当者';

-- 2. 列の追加
ALTER TABLE trsiiden ADD COLUMN IF NOT EXISTS chk_at timestamptz;
ALTER TABLE trsiiden ADD COLUMN IF NOT EXISTS chk_by text;
ALTER TABLE trsiiden ADD COLUMN IF NOT EXISTS chkmemo text;
COMMENT ON COLUMN trsiiden.chk_at IS '倉庫で入荷チェックを完了した日時（スマホ）';
COMMENT ON COLUMN trsiiden.chk_by IS '倉庫で入荷チェックを完了した担当者';
COMMENT ON COLUMN trsiiden.chkmemo IS '入荷チェックの内容（数量が合わなかった明細など）';

-- 3. 操作の記録（20261119_siire.sql の trsiiden_opelog に、入荷チェックを足したもの）
CREATE OR REPLACE FUNCTION trsiiden_opelog() RETURNS trigger AS $$
DECLARE
  v_cols text;
  v_memo text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.vcode, '4',
            left('仕入登録 仕入先=' || coalesce(NEW.vcode, '') || ' 倉庫=' || coalesce(NEW.scode, '') || ' 入荷日=' || coalesce(NEW.inday::text, '')
                 || ' 合計=' || coalesce(NEW.total, 0) || coalesce(' ' || NEW.dmemo, ''), 900),
            NEW.created_by);
    RETURN NULL;
  END IF;

  -- 倉庫での入荷チェック（スマホ）
  IF NEW.chk_at IS DISTINCT FROM OLD.chk_at AND NEW.chk_at IS NOT NULL THEN
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.vcode, '4', left('入荷チェック ' || coalesce(NEW.chkmemo, ''), 900), NEW.chk_by);
  END IF;

  -- 画面からの保存（updated_at が変わる更新）。入荷チェックの更新では記録しない
  IF NEW.updated_at IS DISTINCT FROM OLD.updated_at AND NEW.chk_at IS NOT DISTINCT FROM OLD.chk_at THEN
    SELECT string_agg(n.key, ',' ORDER BY n.key) INTO v_cols
      FROM jsonb_each(to_jsonb(NEW)) n
     WHERE n.key NOT IN ('updated_at', 'updated_by', 'created_at', 'created_by', 'chk_at', 'chk_by', 'chkmemo')
       AND n.value IS DISTINCT FROM (to_jsonb(OLD) -> n.key);
    v_memo := '仕入変更' || CASE WHEN v_cols IS NULL THEN '（ヘッダの変更なし）' ELSE ' 項目=' || v_cols END
           || CASE WHEN NEW.total IS DISTINCT FROM OLD.total
                   THEN ' 合計=' || coalesce(OLD.total, 0) || '→' || coalesce(NEW.total, 0) ELSE '' END;
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.vcode, '4', v_memo, NEW.updated_by);
  END IF;
  RETURN NULL;
END
$$ LANGUAGE plpgsql
SET search_path FROM CURRENT;  -- test の伝票は test.tropelog に書く（実行時の search_path は public のため）

-- 確認用: SELECT * FROM trsiichk ORDER BY updated_at DESC LIMIT 20;

-- ---------------------------------------------------------------------
-- Hasura 側の設定（staff の権限。test_ 付きと本番の両方）
--   ・Reload metadata。trsiichk を Track する（test は test_trsiichk）
--   ・trsiichk の select / insert / update 権限（staff）: すべての列、行の条件なし（他の表と同じ）
--   ・trsiiden の select / update 権限（staff）に chk_at, chk_by, chkmemo を含める
-- ---------------------------------------------------------------------
