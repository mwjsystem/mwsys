\encoding UTF8
-- =====================================================================
-- データ移行 3: 顧客マスタ（msmember・msmadr）の洗い替え（会社ごと）
--
-- 実行例: psql -X -v schema=test -v comp=1 -f 03_member.sql
--
-- 前提: 00_clear → 01_before_load → load.ps1（msmember.csv → mig_msmember、msmadr.csv → mig_msmadr、
--       受注伝票 trjyuden も投入済み）→ 02_after_load の後に実行する（最新の受注伝票から補完するため）
--
-- 行うこと（1 つのトランザクション。何度実行してもよい）
--   1. いまの新システムの顧客（id = comp）を mig_msmember_prev / mig_msmadr_prev に控える（毎回作り直す）
--   2. msmadr・msmember の id = comp を消し、現行の CSV から入れ直す（洗い替え）
--   3. 現行に無い項目を補完する
--      a. 最新の受注伝票（受注先 = 顧客コード、取消・返品を除き、受注日・伝票番号の新しい順で 1 件）から
--           hcode 配送 / tcode 内勤担当 / jcode 受注方法 / shobunrui 小分類
--           ntype  納品書タイプ      = 自分宛て（納品先 = 受注先）の最新の受注伝票の buntype
--           tntype 直送納品書タイプ  = 別の納品先（直送）の最新の受注伝票の buntype
--           gadr   納品先の初期値    = 最新の受注伝票が直送なら '2'、その他住所(nadr=1)なら '1'、それ以外 '0'
--         受注伝票が無い顧客は、1 で控えた新システムの値（無ければ NULL / '0'）
--      b. 受注伝票にも現行にも無い項目（webid・特別単価区分・mail5・時間帯・領収書宛名・メール対象・JAN・最終取引日）は
--         1 で控えた新システムの値を戻す（webid は 20261101_msmember_webid_public.sql をもう一度流してもよい）
--      c. Amazon（408223）は受注取込（frmamazon）と同じ値にそろえる: 納品書タイプ 10・配送 7・受注方法 10
--   4. 住所の都道府県を region / local に分ける（旧 msmadr_UPDATE.sql と同じ）
--   5. 結果（件数・新システムにしか無かった顧客／住所・Amazon の住所のセンターコード）を表示する
--
-- 操作の記録・更新日時のトリガーは止めて入れる。created_by / updated_by は 'migration'。
-- =====================================================================
\set ON_ERROR_STOP on
\if :{?schema}
\else
  \set schema public
\endif
\if :{?comp}
\else
  \echo '-v comp=<会社ID> を指定してください（マーシャル 1 / 東海堂 2）'
  \quit
\endif
\timing on

BEGIN;
SET LOCAL search_path TO :"schema";
SELECT set_config('mig.comp', :'comp', true) AS "会社ID";

-- CSV が入っているか（空のまま洗い替えると顧客が全部消えるので止める）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM mig_msmember WHERE id = current_setting('mig.comp')::smallint) THEN
    RAISE EXCEPTION 'mig_msmember に会社 % の行がありません（load.ps1 で msmember.csv を入れてください）', current_setting('mig.comp');
  END IF;
  IF EXISTS (SELECT 1 FROM mig_msmember WHERE id <> current_setting('mig.comp')::smallint) THEN
    RAISE EXCEPTION 'mig_msmember に他の会社の行があります（抽出 SQL の where を確認してください）';
  END IF;
END
$$;

-- ---------------------------------------------------------------------
-- 1. 控え
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS mig_msmember_prev, mig_msmadr_prev;
CREATE TABLE mig_msmember_prev AS SELECT * FROM msmember WHERE id = :comp;
CREATE TABLE mig_msmadr_prev   AS SELECT * FROM msmadr   WHERE id = :comp;
COMMENT ON TABLE mig_msmember_prev IS 'データ移行用: 洗い替え前の顧客マスタの控え（03_member.sql が毎回作り直す）';
COMMENT ON TABLE mig_msmadr_prev   IS 'データ移行用: 洗い替え前の顧客住所の控え（03_member.sql が毎回作り直す）';

-- ---------------------------------------------------------------------
-- 2. 洗い替え
-- ---------------------------------------------------------------------
ALTER TABLE msmadr   DISABLE TRIGGER USER;
ALTER TABLE msmember DISABLE TRIGGER USER;

DELETE FROM msmadr   WHERE id = :comp;
DELETE FROM msmember WHERE id = :comp;
-- ここで外部キーの違反になるときは、msmember を参照している表（伝票以外）がある。表の名前を知らせてください

-- 最新の受注伝票（受注先ごと）
CREATE TEMP TABLE mig_lastjyu ON COMMIT DROP AS
SELECT DISTINCT ON (trim(j.mcode))
       trim(j.mcode) AS mcode, j.hcode, j.tcode, j.jcode, j.shobunrui, j.buntype, j.ncode, j.nadr,
       coalesce(nullif(trim(j.ncode), ''), trim(j.mcode)) <> trim(j.mcode) AS chokuso
  FROM trjyuden j
 WHERE j.id = :comp AND j.del IS NOT TRUE AND coalesce(j.denku, 0) = 0 AND j.mcode IS NOT NULL
 ORDER BY trim(j.mcode), j.day DESC, j.denno DESC;

CREATE TEMP TABLE mig_lastbun ON COMMIT DROP AS
SELECT DISTINCT ON (trim(j.mcode), (coalesce(nullif(trim(j.ncode), ''), trim(j.mcode)) <> trim(j.mcode)))
       trim(j.mcode) AS mcode,
       coalesce(nullif(trim(j.ncode), ''), trim(j.mcode)) <> trim(j.mcode) AS chokuso,
       j.buntype
  FROM trjyuden j
 WHERE j.id = :comp AND j.del IS NOT TRUE AND coalesce(j.denku, 0) = 0 AND j.mcode IS NOT NULL
   AND nullif(trim(j.buntype), '') IS NOT NULL
 ORDER BY trim(j.mcode), (coalesce(nullif(trim(j.ncode), ''), trim(j.mcode)) <> trim(j.mcode)), j.day DESC, j.denno DESC;

INSERT INTO msmember (
    id, mcode, sei, mei, kana, tankakbn, mtax, pcode, hcode, daibunrui, chubunrui, tcode1, tcode, sptnkbn,
    del, dmemo, memo, torikbn, sime, site, inday, scde, sscode, mail, mail2, mail3, mail4, mail5,
    created_at, updated_at, lday, created_by, updated_by, shobunrui, htime, ryoate, ntype, tntype, webid,
    mtgt1, mtgt2, mtgt3, mtgt4, mtgt5, jcode, gadr, jan, seikyuu)
SELECT
    s.id, trim(s.mcode), coalesce(s.sei, 'dummy'), p.mei, s.kana,
    coalesce(s.tankakbn, '1'), coalesce(s.mtax, '0'), s.pcode,
    coalesce(l.hcode, p.hcode),
    s.daibunrui, s.chubunrui, s.tcode1,
    coalesce(l.tcode, p.tcode),
    p.sptnkbn,
    coalesce(s.del, false), s.dmemo, s.memo, coalesce(s.torikbn, false), s.sime, s.site, s.inday, s.scde, s.sscode,
    s.mail, s.mail2, s.mail3, s.mail4, p.mail5,
    coalesce(p.created_at, now()), now(), p.lday, coalesce(p.created_by, 'migration'), 'migration',
    coalesce(l.shobunrui, p.shobunrui), p.htime, p.ryoate,
    coalesce(bs.buntype, p.ntype),
    coalesce(bc.buntype, p.tntype),
    p.webid, p.mtgt1, p.mtgt2, p.mtgt3, p.mtgt4, p.mtgt5,
    coalesce(l.jcode, p.jcode),
    CASE WHEN l.mcode IS NULL THEN coalesce(p.gadr, '0')
         WHEN l.chokuso THEN '2'
         WHEN l.nadr = 1 THEN '1'
         ELSE '0' END,
    p.jan, s.seikyuu
  FROM mig_msmember s
  LEFT JOIN mig_msmember_prev p ON p.mcode = trim(s.mcode)
  LEFT JOIN mig_lastjyu l        ON l.mcode = trim(s.mcode)
  LEFT JOIN mig_lastbun bs       ON bs.mcode = trim(s.mcode) AND NOT bs.chokuso
  LEFT JOIN mig_lastbun bc       ON bc.mcode = trim(s.mcode) AND bc.chokuso
 WHERE s.id = :comp;
-- 主キー違反で止まるときは、現行の顧客コードが前後の空白違いで重なっている（CSV を確認）

-- 3c. Amazon（受注取込と同じ値。frmamazon/amazon.service.ts の AMZ_*）
UPDATE msmember m
   SET ntype  = coalesce((SELECT b.code FROM msbuntype b WHERE b.id = m.id AND b.code ~ '^\s*[0-9]+\s*$' AND b.code::int = 10 LIMIT 1), m.ntype),
       tntype = coalesce((SELECT b.code FROM msbuntype b WHERE b.id = m.id AND b.code ~ '^\s*[0-9]+\s*$' AND b.code::int = 10 LIMIT 1), m.tntype),
       hcode  = '7',
       jcode  = '10'
 WHERE m.id = :comp AND m.mcode = '408223' AND :comp = 1;  -- Amazon の取引はマーシャル（id 1）だけ

-- 住所（列は msmadr と同じ。created/updated は CSV の値）
INSERT INTO msmadr SELECT * FROM mig_msmadr WHERE id = :comp AND mcode IS NOT NULL;
-- 顧客マスタに無い顧客の住所があると外部キー違反で止まる（memadr_1.sql は member と内部結合しているので通常は無い）

-- ---------------------------------------------------------------------
-- 4. 都道府県を分ける（旧 msmadr_UPDATE.sql）
-- ---------------------------------------------------------------------
UPDATE msmadr SET region = left(region, 3), local = concat(substr(region, 4, char_length(region)), local)
 WHERE id = :comp AND substr(region, 3, 1) IN ('都', '府', '県', '道');
UPDATE msmadr SET region = left(region, 4), local = concat(substr(region, 5, char_length(region)), local)
 WHERE id = :comp AND substr(region, 4, 1) = '県';

ALTER TABLE msmadr   ENABLE TRIGGER USER;
ALTER TABLE msmember ENABLE TRIGGER USER;
ANALYZE msmember;
ANALYZE msmadr;

-- ---------------------------------------------------------------------
-- 5. 結果
-- ---------------------------------------------------------------------
SELECT '顧客 CSV / 移行後' AS 項目, (SELECT count(*) FROM mig_msmember WHERE id = :comp) || ' / ' || (SELECT count(*) FROM msmember WHERE id = :comp) AS 値
UNION ALL SELECT '住所 CSV / 移行後', (SELECT count(*) FROM mig_msmadr WHERE id = :comp) || ' / ' || (SELECT count(*) FROM msmadr WHERE id = :comp)
UNION ALL SELECT '最新の受注伝票から補完した顧客', count(*)::text FROM msmember m WHERE m.id = :comp AND EXISTS (SELECT 1 FROM mig_lastjyu l WHERE l.mcode = m.mcode)
UNION ALL SELECT '受注伝票の無い顧客（新システムの控えの値）', count(*)::text FROM msmember m WHERE m.id = :comp AND NOT EXISTS (SELECT 1 FROM mig_lastjyu l WHERE l.mcode = m.mcode)
UNION ALL SELECT '内勤担当 tcode が空の顧客（取消を除く）', count(*)::text FROM msmember WHERE id = :comp AND NOT del AND nullif(trim(tcode), '') IS NULL
UNION ALL SELECT '納品書タイプ ntype が空の顧客（取消を除く）', count(*)::text FROM msmember WHERE id = :comp AND NOT del AND nullif(trim(ntype), '') IS NULL
UNION ALL SELECT '新システムにしか無かった顧客（消えた）', count(*)::text FROM mig_msmember_prev p WHERE NOT EXISTS (SELECT 1 FROM msmember m WHERE m.id = :comp AND m.mcode = p.mcode)
UNION ALL SELECT '新システムにしか無かった住所（消えた）', count(*)::text FROM mig_msmadr_prev p WHERE NOT EXISTS (SELECT 1 FROM msmadr a WHERE a.id = :comp AND a.mcode = p.mcode AND a.eda = p.eda)
UNION ALL SELECT 'webid を戻した顧客', count(*)::text FROM msmember WHERE id = :comp AND nullif(webid, '') IS NOT NULL
UNION ALL SELECT 'Amazon(408223) の住所 / うち備考 nmemo あり', (SELECT count(*) FROM msmadr WHERE id = :comp AND mcode = '408223') || ' / ' || (SELECT count(*) FROM msmadr WHERE id = :comp AND mcode = '408223' AND nullif(trim(nmemo), '') IS NOT NULL);

-- 新システムにしか無かった顧客・住所（入れ直すか、現行に登録してから次のリハーサルで入れるか決める）
SELECT 'msmember' AS 表, p.mcode, NULL::int AS eda, p.sei AS 名前, p.created_at, p.created_by
  FROM mig_msmember_prev p WHERE NOT EXISTS (SELECT 1 FROM msmember m WHERE m.id = :comp AND m.mcode = p.mcode)
UNION ALL
SELECT 'msmadr', p.mcode, p.eda, p.adrname, NULL, NULL
  FROM mig_msmadr_prev p WHERE NOT EXISTS (SELECT 1 FROM msmadr a WHERE a.id = :comp AND a.mcode = p.mcode AND a.eda = p.eda)
 ORDER BY 1, 2, 3
 LIMIT 200;

COMMIT;
