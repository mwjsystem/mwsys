-- =====================================================================
-- 移行データの trjyuden.idenno = 0 の整理（何度実行してもよい）
--   移行SQL（work/jyuden.sql）はすべての受注伝票に idenno = 0 を入れているため、
--   請求伝票との紐づけが無い。次のように置き換える。
--     ・掛売で、売上日以降に締め日のある請求伝票がある → その請求伝票番号（請求済）
--     ・掛売で、売上日が 2026-01-01 以降、または売上日が未設定 → NULL（未請求。次の締めで計上）
--     ・掛売で、それ以外（2026 年より前で、その後に請求伝票の無い請求先） → 0 のまま（移行時に請求対象外）
--     ・都度（torikbn が true 以外） → NULL
--   idenno = 0 は「移行時に請求対象外」の意味（trnyusub.kdenno = 0 と同じ）。ロックの対象にはしない。
-- 20261028_seikyu_shime.sql を適用済みのスキーマ（test）に対して実行する。
-- =====================================================================
SET search_path TO test;  -- 本番は 20261028_seikyu_shime.sql に同じ処理が入っている

-- 請求済のロックは idenno > 0 の伝票だけにする（0 は移行時に請求対象外）
CREATE OR REPLACE FUNCTION trjyuden_lock_billed() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF coalesce(OLD.idenno, 0) > 0 THEN
      RAISE EXCEPTION '受注伝票%は請求済（請求伝票%）のため削除できません', OLD.denno, OLD.idenno;
    END IF;
    RETURN OLD;
  END IF;
  IF coalesce(OLD.idenno, 0) > 0 AND NEW.idenno IS NOT DISTINCT FROM OLD.idenno
     AND (NEW.total, NEW.taxtotal, NEW.scde, NEW.torikbn, NEW.uday, COALESCE(NEW.del, false))
         IS DISTINCT FROM
         (OLD.total, OLD.taxtotal, OLD.scde, OLD.torikbn, OLD.uday, COALESCE(OLD.del, false)) THEN
    RAISE EXCEPTION '受注伝票%は請求済（請求伝票%）のため変更できません', OLD.denno, OLD.idenno;
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- 都度請求の伝票・売上日未設定の伝票は請求の紐づけ不要
UPDATE trjyuden SET idenno = NULL
 WHERE idenno = 0 AND (torikbn IS NOT TRUE OR uday IS NULL);

-- 掛売: 売上日以降で最初の締め日の請求伝票に計上済とする
UPDATE trjyuden j
   SET idenno = coalesce((SELECT k.denno FROM trseikyu k
                           WHERE k.id = j.id AND k.mcode = j.scde AND k.sday >= j.uday
                           ORDER BY k.sday LIMIT 1), 0)
 WHERE j.torikbn AND j.idenno = 0;

-- 掛売: 請求伝票の無いもののうち、2026 年以降の売上は未請求に戻す（次の締めで計上）
UPDATE trjyuden SET idenno = NULL
 WHERE torikbn AND idenno = 0 AND uday >= '2026-01-01';

COMMENT ON COLUMN trjyuden.idenno IS '計上先請求伝票番号（掛売の締め処理で設定。NULL = 未請求、0 = 移行時に請求対象外）';
