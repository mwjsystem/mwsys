-- =====================================================================
-- 入金（都度・掛売の入金伝票、一括入金、入金テキスト読込、佐川代引消込）
--
--   入金伝票 trnyusub（ヘッダ）・trnyuden（明細）。
--     kubun 0 = 都度請求（jdenno = 受注伝票番号）、1 = 掛売（月締め請求。mcode = 請求先、idenno = 消込先の請求伝票、
--     kdenno = 締め処理で入金額に計上した請求伝票）。ヘッダの nmoney / smoney / tmoney は明細の合計。
--   取消は del = true（論理削除）。入金残・請求残の集計から外れる。
--
--   1. vnyuzan（受注の入金残）を直す
--      ・入金伝票番号ごとに集計していたため、1 つの受注に入金伝票が 2 枚以上あると行が重なり、入金残が正しく出なかった
--        → 受注ごとに集計する
--      ・取消の条件を del IS NULL から「del が true でない」に直す（del = false の伝票も集計から外れていた）
--   2. vseikyuzan（新規）: 請求伝票（掛売）ごとの入金済額と残（消込先 idenno で集計）
--   3. 操作ログ（tropelog、extype = '3' 入金伝票）: 登録・変更・取消
--
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する。
--   vseikyuzan は「Track this」にチェックを入れて実行する（入れ忘れたら Data の画面で Track する）。
-- 先に確かめること: SELECT * FROM msbunrui WHERE kubun = 'extype' AND value = '3';   -- 3 = 入金伝票
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

-- 1. 受注の入金残（列は今と同じ。Hasura のリレーション vnyuzan.trnyusubs はそのまま使える）
CREATE OR REPLACE VIEW vnyuzan AS
SELECT
  j.id, j.denno, j.day, j.uday, j.nday, j.mcode, j.scde, j.pcode, j.hcode, j.okurino, j.total, j.torikbn, j.idenno,
  j.daibiki, j.tcode, j.tcode1, j.scode, j.dmemo AS bikou,
  COALESCE(a.nsum, 0::numeric) AS nyukin,
  COALESCE(a.ssum, 0::numeric) AS shukin,
  COALESCE(a.csum, 0::numeric) AS chosei,
  j.total - COALESCE(a.nsum, 0::numeric) + COALESCE(a.ssum, 0::numeric) - COALESCE(a.csum, 0::numeric) AS nyuzan
FROM trjyuden j
LEFT JOIN (
  SELECT n.id, n.jdenno, sum(n.nmoney) AS nsum, sum(n.smoney) AS ssum, sum(n.tmoney) AS csum
    FROM trnyusub n
   WHERE n.del IS NOT TRUE AND n.jdenno IS NOT NULL
   GROUP BY n.id, n.jdenno
) a ON a.id = j.id AND a.jdenno = j.denno;

-- 2. 請求伝票（掛売）ごとの入金済額と残
CREATE OR REPLACE VIEW vseikyuzan AS
SELECT
  s.id, s.denno, s.mcode, s.sday, s.seikyu, s.sstatus, s.del,
  COALESCE(a.nsum, 0::numeric) AS nyukin,
  COALESCE(a.ssum, 0::numeric) AS shukin,
  COALESCE(a.csum, 0::numeric) AS chosei,
  COALESCE(s.seikyu, 0) - COALESCE(a.nsum, 0::numeric) + COALESCE(a.ssum, 0::numeric) - COALESCE(a.csum, 0::numeric) AS zan
FROM trseikyu s
LEFT JOIN (
  SELECT n.id, n.idenno, sum(n.nmoney) AS nsum, sum(n.smoney) AS ssum, sum(n.tmoney) AS csum
    FROM trnyusub n
   WHERE n.del IS NOT TRUE AND n.kubun = 1 AND n.idenno IS NOT NULL
   GROUP BY n.id, n.idenno
) a ON a.id = s.id AND a.idenno = s.denno;
COMMENT ON VIEW vseikyuzan IS '請求伝票（掛売）ごとの入金済額と残（入金伝票の消込先 idenno で集計）';

-- 3. 入金伝票の操作ログ
CREATE OR REPLACE FUNCTION trnyusub_opelog() RETURNS trigger AS $$
DECLARE
  v_kind text;
  v_memo text;
BEGIN
  v_kind := CASE WHEN NEW.kubun = 1 THEN '掛売 請求先=' || coalesce(NEW.mcode, '') || coalesce(' 請求伝票=' || NEW.idenno, '')
                 ELSE '受注=' || coalesce(NEW.jdenno::text, '') END;
  IF TG_OP = 'INSERT' THEN
    v_memo := '入金登録 ' || v_kind || ' 入金日=' || NEW.day || ' 入金=' || coalesce(NEW.nmoney, 0)
           || CASE WHEN coalesce(NEW.smoney, 0) <> 0 THEN ' 出金=' || NEW.smoney ELSE '' END
           || CASE WHEN coalesce(NEW.tmoney, 0) <> 0 THEN ' 調整=' || NEW.tmoney ELSE '' END
           || coalesce(' ' || NEW.memo, '');
    INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
    VALUES (NEW.id, NEW.denno::text, NEW.mcode, '3', left(v_memo, 900), NEW.created_by);
    RETURN NULL;
  END IF;
  IF NEW.del IS TRUE AND OLD.del IS NOT TRUE THEN
    v_memo := '入金取消 ' || v_kind || ' 入金=' || coalesce(OLD.nmoney, 0);
  ELSIF NEW.del IS NOT TRUE AND OLD.del IS TRUE THEN
    v_memo := '入金取消を戻す ' || v_kind;
  ELSIF NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
    v_memo := '入金変更 ' || v_kind || ' 入金日=' || NEW.day
           || CASE WHEN NEW.nmoney IS DISTINCT FROM OLD.nmoney THEN ' 入金=' || coalesce(OLD.nmoney, 0) || '→' || coalesce(NEW.nmoney, 0) ELSE '' END
           || CASE WHEN NEW.smoney IS DISTINCT FROM OLD.smoney THEN ' 出金=' || coalesce(OLD.smoney, 0) || '→' || coalesce(NEW.smoney, 0) ELSE '' END
           || CASE WHEN NEW.tmoney IS DISTINCT FROM OLD.tmoney THEN ' 調整=' || coalesce(OLD.tmoney, 0) || '→' || coalesce(NEW.tmoney, 0) ELSE '' END;
  ELSE
    RETURN NULL;  -- 締め処理での計上（kdenno）などは記録しない
  END IF;
  INSERT INTO tropelog (id, keycode, subkeycd, extype, memo, created_by)
  VALUES (NEW.id, NEW.denno::text, NEW.mcode, '3', left(v_memo, 900), NEW.updated_by);
  RETURN NULL;
END
$$ LANGUAGE plpgsql
SET search_path FROM CURRENT;  -- test の伝票は test.tropelog に書く（実行時の search_path は public のため）

DROP TRIGGER IF EXISTS trnyusub_opelog ON trnyusub;
CREATE TRIGGER trnyusub_opelog
  AFTER INSERT OR UPDATE ON trnyusub
  FOR EACH ROW EXECUTE FUNCTION trnyusub_opelog();

-- ---------------------------------------------------------------------
-- Hasura 側の設定（staff の権限）
--   ・trnyusub: select / insert / update（del を含む全部の列）
--   ・trnyuden: select / insert / delete（全部の列）
--   ・vnyuzan: 列は今と同じなので、そのまま（リレーション trnyusubs もそのまま）
--   ・vseikyuzan: Track して select（全部の列）
-- ---------------------------------------------------------------------
