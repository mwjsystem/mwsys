-- =====================================================================
-- 仕入伝票: 操作ログ（発注番号を指定した一括登録・画面の登録・変更）
--
--   ・操作ログ（tropelog、extype = '4' 仕入伝票）: 登録・変更を記録する
--   ・在庫: 仕入（入荷）はアプリが trzaiko の hnyu（入荷）に足す（変更のときは読み込んだときの分を引いてから足す）
--
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する。
-- 先に確かめること:
--   SELECT * FROM msbunrui WHERE kubun = 'extype' AND value = '4';   -- 4 = 仕入伝票
--   仕入（入荷）が在庫のどの列に入っているか（現行から移したデータで、仕入明細と在庫の列を比べる）:
--     SELECT s.inday, s.gcode, sum(s.suu) AS siire, max(z.hnyu) AS hnyu, max(z.nyuk) AS nyuk
--       FROM trsiimei s JOIN trsiiden d ON d.id = s.id AND d.denno = s.denno
--       LEFT JOIN trzaiko z ON z.id = s.id AND z.scode = d.scode AND z.gcode = s.gcode AND z.day = s.inday
--      WHERE s.inday >= '2026-06-01' GROUP BY s.inday, s.gcode ORDER BY s.inday DESC LIMIT 20;
--     → siire と hnyu が合っていれば hnyu（アプリの今の作り）。nyuk と合うなら知らせてください
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

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
  IF NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
    SELECT string_agg(n.key, ',' ORDER BY n.key) INTO v_cols
      FROM jsonb_each(to_jsonb(NEW)) n
     WHERE n.key NOT IN ('updated_at', 'updated_by', 'created_at', 'created_by')
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

DROP TRIGGER IF EXISTS trsiiden_opelog ON trsiiden;
CREATE TRIGGER trsiiden_opelog
  AFTER INSERT OR UPDATE ON trsiiden
  FOR EACH ROW EXECUTE FUNCTION trsiiden_opelog();

-- ---------------------------------------------------------------------
-- Hasura 側の設定（staff の権限）
--   ・trsiiden / trsiimei: select / insert / update / delete（今の画面と同じ）
--   ・trzaiko: insert / update の列に hnyu（ほかの伝票と同じ）
--   ・trhatmei: update の列に inday（入荷済の印）、trhatden: update の列に hdstatus（発注の状況）
-- ---------------------------------------------------------------------
