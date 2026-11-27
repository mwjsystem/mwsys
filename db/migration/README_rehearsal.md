# データ移行リハーサル手順書（マーシャル：現行 ID 1 → 新 ID 1）

2026-11-27 作成。リハーサルは今回ともう 1 回。問題が無ければ本番移行 → 本稼働。
東海堂（現行 ID 32 → 新 ID 2）は、マーシャルの本稼働が安定してから同じ手順で行う（最後の「東海堂のとき」を参照）。

## 方針

| 区分 | 表 | やり方 |
|---|---|---|
| 伝票 | 受注・発注・仕入・移動・展開・在庫調整・発注外入荷・在庫・棚卸・請求・入金 | 会社の行を消して（`00_clear.sql`）CSV を投入 |
| 仕入先 | msvendor | 同上（消して投入） |
| 顧客 | msmember・msmadr | **洗い替え**（`03_member.sql`）。現行に無い項目は最新の受注伝票から補完 |
| 商品 | msgoods・msgtanka・msgzai | **差分更新**（`04_goods.sql`）。CSV の列だけ上書き、無い商品は追加、新システムだけの列は残す |
| システム的なマスタ | 分類・担当者・倉庫・帳票・納品書タイプなど | 今のまま（触らない） |

以前の手順（`work\移行用SQL\psql.xlsm`）は表ごとに TRUNCATE していたが、マーシャル本稼働後に東海堂を入れるときに
マーシャルの行まで消えるので、すべて **会社 ID（id 列）で消す・更新する** ようにした。

## 対象の表と抽出 SQL（現行 → CSV）

抽出 SQL は `db/migration/oracle/`（ID 1 版）。CSV は **ヘッダ付き**、ファイル名は下のとおり（`load.ps1` がこの名前で探す）。

| CSV | 新システムの表 | 抽出 SQL | 備考 |
|---|---|---|---|
| msgoods.csv | msgoods（差分） | goods_1.sql | 現行 GOODS（ファイルレイアウト v322【08】）→ gcode・gtext・jan・unit・tanano・zkbn・gskbn・tkbn。グループ code は追加のときだけ 00TMP |
| msgtanka.csv | msgtanka（差分） | gtanka_1.sql | ヘッダ＝列名（別名を付けた） |
| msgzai.csv | msgzai（差分） | gzai_1.sql | 同上 |
| msmember.csv | msmember（洗い替え） | member_1.sql | 旧 member.sql から受注伝票の結合を外し、seikyuu を追加 |
| msmadr.csv | msmadr（洗い替え） | memadr_1.sql | |
| msvendor.csv | msvendor | vendor_1.sql | |
| trchoden.csv | trchoden（在庫調整） | hakden_1.sql | |
| trgtana1.csv | trgtana | tana_1.sql | |
| trhatden.csv / trhatmei.csv | trhatden / trhatmei | hatden_1.sql / hatmei_1.sql | |
| trhgnden.csv | trhgnden（発注外入荷） | inzai_1.sql | |
| trjyuden.csv | trjyuden | jyuden_1.sql | 返品は +20000000（一部 +30000000） |
| trjyumei1〜3.csv | trjyumei | jyumei_1.sql | denno の範囲を分けて 3 回出す |
| trsiiden.csv / trsiimei.csv | trsiiden / trsiimei | siiden_1.sql / siimei_1.sql | |
| trmovsub.csv / trmovden.csv | trmovsub / trmovden | movsub_1.sql / movden_1.sql | movden は旧 SQL の and/or の優先順位の誤りを直した |
| trtenden.csv | trtenden | tenden_1.sql | |
| trzaiko1.csv | trzaiko | zaiko_1.sql | 2023-07-01 以降だけ（旧 SQL のまま。2026-11-27 確認済み） |
| trseikyu.csv | trseikyu（trseikyu_load 経由） | seikyu_1.sql | |
| trnyuden.csv / trnyusub.csv | trnyuden / trnyusub | `work\移行用SQL\入金伝票.xlsm` | ID 1 だけで出す |
| （CSV なし） | trjyumzai（受注明細の構成品） | 05_finish.sql で作る | 現行に無い。投入した受注明細と msgzai から（旧 trjyumzai.sql と同じ条件） |
| （CSV なし） | trjyumzai 以外の新システムだけの伝票 | 00_clear.sql で消す | 出荷キープ・未収・加工指示・棚卸入力・仕入チェック・受注履歴（テスト期間の入力） |

### 品目マスタ（goods_1.sql → 04_goods.sql）

- 突き合わせは id・品番（gcode）。CSV にある列（上の 8 列）だけを、値が違えば上書きする。無い品番は追加する。
- サイズ・色・重量・送料区分・個口・発注ロット・海外発注品番・加工前品番・在庫表の列・商品グループは、新システムで入れたものを残す。
- 追加した品番の商品グループは **00TMP（一時仮グループ）**。移行後に新システムでグループを付ける（04 の結果に件数が出る）。
  付け直したグループは、次のリハーサル・本番移行でも戻らない（04 は既存の品番のグループに触らない。
  06 は test が 00TMP のときは public のグループを残す）。test・public のどちらで付け直してもよい。
- 中止区分 tkbn: 現行の 1 中止 → 9 廃盤。新システムで 1 発注専用・2 在庫管理用にした品番は、現行が中止にならない限りそのまま。
- 現行の kana・subname・分類（dbun・sbun・tbun）・fcode・fmemo・備考・kakuho・konpo などは移さない（必要な列があれば goods_1.sql に足す）。
- 単価（msgtanka）は id・品番・採用日、構成品（msgzai）は id・品番・構成品番で突き合わせる。

## 準備（前日まで）

1. 新システムの DB に、`db/` の SQL がすべて適用済みか確認（test・public）。
2. psql（Windows）に接続できること。接続先は環境変数で渡す（パスワードはスクリプトに書かない）。
   ```powershell
   $env:PGHOST = '<host>'; $env:PGUSER = '<user>'; $env:PGDATABASE = '<db>'
   ```
3. リハーサルは **test スキーマ**（`-Schema test` / `-v schema=test`）に入れる。staging の画面は本番 DB の test を見る設定で確認する。
4. 為替レート: `db/20261209_msrate.sql` を test・public に適用し、`msrate` に会社ごとの USD のレートを適用開始日つきで入れる
   （最初は mssystem.currate が 2000-01-01 の 1 行だけ入る）。02 で受注明細の USD の原価を **受注日のレート** で円にする
   （以前は抽出 SQL で 110 倍の固定）。レートを変えたら 00 からやり直す（02 は換算済みの会社をとばす）

## 当日の手順

所要時間は前回の実績を記入していく（リハーサル 1 回目で計測）。

| # | 作業 | コマンド | 時間 |
|---|---|---|---|
| 1 | 現行の入力を止める（本番のときだけ） | | |
| 2 | 現行から CSV を出す（oracle/*.sql、入金伝票.xlsm） | `C:\temp\<日付>\` に置く | |
| 3 | 会社の伝票・仕入先を消す | `psql -X -v schema=test -v comp=1 -f 00_clear.sql` | |
| 4 | 受け皿の表を作る・操作ログのトリガーを止める | `psql -X -v schema=test -f 01_before_load.sql` | |
| 5 | CSV を入れる | `.\load.ps1 -CsvDir C:\temp\<日付> -Schema test -Comp 1` | |
| 6 | 請求・入金の付け直し・受注明細の USD 原価を円に | `psql -X -v schema=test -v comp=1 -f 02_after_load.sql` | |
| 7 | 顧客マスタの洗い替え | `psql -X -v schema=test -v comp=1 -f 03_member.sql` | |
| 8 | 商品マスタの差分（まず確認） | `psql -X -v schema=test -v comp=1 -v dry=1 -f 04_goods.sql` | |
| 9 | 商品マスタの差分（更新） | `psql -X -v schema=test -v comp=1 -f 04_goods.sql` | |
| 10 | 採番・受注明細の構成品・件数の確認 | `psql -X -v schema=test -v comp=1 -f 05_finish.sql` | |
| 11 | 補足のデータ | `public_sql_20261029\20261101_msmember_webid_public.sql`（webid は 03 で戻すが、member.xlsx が新しければ流す。先頭の `SET search_path` を test に） | |
| 12 | test の画面で確認（下の「確認項目」） | | |
| 13 | test の内容を public に写す | `psql -X -v comp=1 -f 06_copy_to_public.sql` | |
| 14 | public の画面で数件確認（件数は 13 の結果で突き合わせ済み） | | |

途中で止まったとき: 3・6・7・9・10・13 はそれぞれ 1 トランザクションなので、直してその番号から流し直せばよい。
5 は 1 ファイルずつなので `-Only trjyumei2` のように失敗したファイルから。ただし同じファイルを 2 回入れると重複するので、
そのときは 3 からやり直す。

## 顧客マスタの補完（03_member.sql）

現行の顧客マスタに無い項目は、新システムに入れた受注伝票の **受注先（mcode）ごとの最新の 1 件**（取消・返品を除く。受注日 → 伝票番号の新しい順）から取る。

| 項目 | 取り方 |
|---|---|
| tcode 内勤担当 / hcode 配送 / jcode 受注方法 / shobunrui 小分類 | 最新の受注伝票の値 |
| ntype 納品書タイプ | 自分宛て（納品先 = 受注先）の最新の受注伝票の帳票タイプ（buntype） |
| tntype 直送納品書タイプ | 別の納品先の最新の受注伝票の帳票タイプ |
| gadr 納品先の初期値 | 最新が直送なら 2、その他住所なら 1、それ以外 0 |
| 受注伝票の無い顧客 | 洗い替え前の新システムの値（控え `mig_msmember_prev`） |
| webid・特別単価区分・mail5・時間帯・領収書宛名・メール対象・JAN | 洗い替え前の新システムの値を戻す |
| Amazon（408223） | 受注取込と同じ値にそろえる（納品書タイプ 10・配送 7・受注方法 10） |

旧 member.sql は納品先（ncode）で最新の受注伝票を取っていたが、受注伝票画面は受注先の顧客マスタから初期値を出すので受注先に変えた。
新システムにしか無かった顧客・住所は消える（03 の最後に一覧が出る）。必要なものは現行に登録してから次のリハーサルで入れる。

## 確認項目（リハーサル後）

- 05_finish.sql の件数（CSV の行数と合うか）、他の会社の行が変わっていないか
- 03_member.sql の結果: 内勤担当・納品書タイプが空の顧客、消えた新システムだけの顧客・住所、Amazon の住所の備考（センターコード）
- 04_goods.sql の dry の結果: 変わる列と件数（想定外の列が大量に変わっていないか）
- 受注伝票画面: 顧客を選んだときの担当・配送・納品書タイプの初期値（数件）
- Amazon 受注取込: 取込済みの PO が「取込済み」になるか（cusden に PO が入っているか）、送り状番号の採番
- 新極真のロイヤリティ（/reproyal）: 移行した月の数字が現行と合うか
- 決算資料（/repkessan）: 売上月別・都度売掛・在庫の赤字（USD 原価 1,000 ドル以上 = 通貨誤りの 7 品目 BG14-08/06/10-NV/EN・KK-DM148CV）・Excel 出力
- 在庫・発注チェック（/repcheck）: 現行 Excel（work\抽出 の国内発注在庫・竹島さん売上）と突き合わせ
- 発注勧告（/frmkankoku）: 現行の発注勧告.xlsm の U 列（発注残）と突き合わせ。古い発注残（2011 年ごろの移行データ・2023 年の 3428403 など）の整理
- 移行時点の棚卸（trgtana）
- 請求: 次の締めで計上される掛売伝票・入金の件数（02 の結果）

## test → public の写し方（06_copy_to_public.sql）

test に入れて確認してから、同じ DB の public へ SQL で写す（CSV を 2 回入れるより速く、test と public が確実に同じになる）。

- 伝票・在庫・請求・入金・仕入先・顧客: public の id = comp の行を消して、test の行を入れる
- 商品（msgoods・msgtanka・msgzai）: 主キーで test の値で上書き・無ければ追加。public にだけある品番は残す
- 新システムだけの伝票（テスト期間の入力）は public でも消す
- 採番（trnumber）は test の番号に合わせる（public の方が大きければそのまま）
- 列は両方のスキーマにある列だけを列名で当てる（どちらかにしか無い列があっても止まらない）
- 他の会社（id ≠ comp）の行には触らない

public の商品マスタに test より新しい手入力がある場合（サイズ・色など）は、13 の前に知らせてください（上書きしない列を決める）。

## 本番移行のとき（リハーサルとの違い）

- 手順はリハーサルと同じ（test に入れて確認 → 06 で public へ）。確認の時間を短くするため、見る画面と件数を前もって決めておく
- 古い発注残の整理、`db/` の未適用 SQL の public 適用と Hasura の権限
- 現行の入力停止 → 抽出 → 投入 → 確認 → 新システムで入力開始 の時刻を決めておく

## 東海堂のとき（現行 ID 32 → 新 ID 2）

- 抽出 SQL は `db/migration/oracle/*_2.sql`（ID 1 版を、出力 id = 2・条件 id = 32 にしたもの）。ID 1 版と違うところ:

| 抽出 SQL | ID 1 版との違い（旧 work\移行用SQL の SQL と同じ） |
|---|---|
| gtanka_2.sql | tanka9 はそのまま tanka9、cost は 0。通貨は goods.sbun = '2' が USD |
| jyuden_2.sql・jyumei_2.sql | 返品は denku > 0 で +20000000（5048394・5046281 だけ +30000000） |
| jyumei_1/2.sql 共通 | 原価は外貨のまま出し、02 が msrate で円にする。通貨は仕入区分 sbun の海外（ID 1 は 1、ID 32 は 2）を USD |
| jyumei_2.sql | denno で分けない（trjyumei1.csv の 1 本。多ければ分けて trjyumei2/3.csv に） |
| zaiko_2.sql・tana_2.sql | 倉庫の絞り込みなし。在庫は 2023-07-01 以降。tana は旧 tana2.sql の条件 id = 2 を 32 に直した |
| goods_2.sql | 追加する商品のグループ 00TMP を、新 ID 2 の商品グループマスタに先に作っておく |

- 抽出する CSV の名前はマーシャルと同じ。ただし trjyuden2.csv・trgtana2.csv・trzaiko2.csv（load.ps1 は -Comp 2 のときだけこれを使う）
- 03_member.sql の Amazon の固定値は id 1 のときだけ
- 00〜05 はすべて `-v comp=2` / `-Comp 2`。マーシャル（id 1）の行には触らない
- 00_clear.sql は id = 2 の伝票を消す。マーシャルの移行時に残っていたテスト用の id 2 の行もここで消える
