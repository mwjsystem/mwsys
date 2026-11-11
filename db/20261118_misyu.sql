-- =====================================================================
-- 未入金管理（未入金の追いかけの記録）とダッシュボード
--
--   1. trmisyu（新規）: 未入金の対応の記録。1 件ごとに追記する（Excel の「経過・連絡日・支払予定日・督促状送付・回収可能性」の代わり）
--      kind 0 = 都度（受注伝票 denno）、1 = 掛売（請求伝票 denno）
--   2. vmisyulast（新規）: 受注・請求伝票ごとの最新の記録（一覧に出す）
--   3. vnyuzan に 受注の取消 del と 受注ステータス jdstatus の列を足す（取消の受注を未入金から外すため。列は最後に足すので、今の列はそのまま）
--
-- 適用方法: Hasura コンソール > Data > SQL で、search_path を test / public に切り替えて 1 回ずつ実行する。
--   「Track this」にチェックを入れて実行し、trmisyu・vmisyulast を Hasura に追加する（入れ忘れたら Data の画面で Track する）。
--   実行後、Hasura の vnyuzan の select の権限に del・jdstatus を足す（列が増えたので「Reload metadata」も）
-- 先に db/20261117_nyukin.sql を流しておくこと
-- =====================================================================
SET search_path TO test;  -- 本番に適用するときは public に変更

-- 1. 未入金の対応の記録
CREATE TABLE IF NOT EXISTS trmisyu (
  sequ       bigserial PRIMARY KEY,
  id         smallint NOT NULL,
  kind       smallint NOT NULL,            -- 0 = 都度（受注伝票）、1 = 掛売（請求伝票）
  denno      integer NOT NULL,             -- 受注伝票番号・請求伝票番号
  mcode      text,                         -- 請求先
  renraku    date,                         -- 連絡日
  yotei      date,                         -- 支払予定日（期限。この日を過ぎたらダッシュボードで知らせる）
  memo       text,                         -- 経過・内容（期限を書く）
  tokusoku   date,                         -- 督促状送付日
  kanou      text,                         -- 回収可能性（高・中・低）
  status     text NOT NULL,                -- 対応中・支払予定・督促状送付・回収困難・取引不可設定・協賛処理・完了
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text
);
CREATE INDEX IF NOT EXISTS trmisyu_key ON trmisyu (id, kind, denno, sequ);
COMMENT ON TABLE trmisyu IS '未入金の対応の記録（受注伝票・請求伝票ごとに追記する）';

-- 2. 最新の記録
CREATE OR REPLACE VIEW vmisyulast AS
SELECT DISTINCT ON (m.id, m.kind, m.denno)
       m.id, m.kind, m.denno, m.sequ, m.mcode, m.renraku, m.yotei, m.memo, m.tokusoku, m.kanou, m.status, m.created_at, m.created_by,
       (SELECT count(*) FROM trmisyu c WHERE c.id = m.id AND c.kind = m.kind AND c.denno = m.denno) AS cnt
  FROM trmisyu m
 ORDER BY m.id, m.kind, m.denno, m.sequ DESC;
COMMENT ON VIEW vmisyulast IS '未入金の対応の最新の記録（受注伝票・請求伝票ごと）';

-- 3. 受注の入金残に、取消・受注ステータスを足す（db/20261117_nyukin.sql の vnyuzan の最後に 2 列）
CREATE OR REPLACE VIEW vnyuzan AS
SELECT
  j.id, j.denno, j.day, j.uday, j.nday, j.mcode, j.scde, j.pcode, j.hcode, j.okurino, j.total, j.torikbn, j.idenno,
  j.daibiki, j.tcode, j.tcode1, j.scode, j.dmemo AS bikou,
  COALESCE(a.nsum, 0::numeric) AS nyukin,
  COALESCE(a.ssum, 0::numeric) AS shukin,
  COALESCE(a.csum, 0::numeric) AS chosei,
  j.total - COALESCE(a.nsum, 0::numeric) + COALESCE(a.ssum, 0::numeric) - COALESCE(a.csum, 0::numeric) AS nyuzan,
  j.del,
  j.jdstatus
FROM trjyuden j
LEFT JOIN (
  SELECT n.id, n.jdenno, sum(n.nmoney) AS nsum, sum(n.smoney) AS ssum, sum(n.tmoney) AS csum
    FROM trnyusub n
   WHERE n.del IS NOT TRUE AND n.jdenno IS NOT NULL
   GROUP BY n.id, n.jdenno
) a ON a.id = j.id AND a.jdenno = j.denno;

-- ---------------------------------------------------------------------
-- Hasura 側の設定（staff の権限）
--   ・trmisyu: Track して select / insert（全部の列）。記録は追記だけ（直さない・消さない）
--   ・vmisyulast: Track して select（全部の列）
--   ・vnyuzan: select の列に del・jdstatus を足す
-- ---------------------------------------------------------------------
