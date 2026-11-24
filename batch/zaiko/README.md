# 在庫連携バッチ

現行の `★MW在庫表.xlsm` の置き換え。Excel を使わず、社内のバッチサーバーで動かす。

| ジョブ | 内容 | 現行 |
|---|---|---|
| `list` | 在庫表 `MW在庫一覧.xlsx` を作る | `main` と `Make_zip` の一覧作成 |
| `csv` | おちゃのこの `products.csv` を更新する | `Make_csv` |
| `rms` | 楽天の `normal-item.xlsx`、ANA Mall の `goods_stock.csv` を更新する | `Edit_rms` |
| `barra` | BARRA 在庫一覧をメールに添付して送る | `Make_Barra` |

## 準備

```bash
pip install -r requirements.txt
```

サーバーの環境変数に次を設定する（ファイルには書かない）。

- `MWSYS_HASURA_SECRET`：Hasura の admin secret
- `MWSYS_SCHEMA`：テスト中は `test`。本番は設定しない
- `MWSYS_LOG`：`C:\mwj\MWJAPAN\mwjapan - share\system\batch\log.txt`
- `MWSYS_SMTP_USER`、`MWSYS_SMTP_PASSWORD`：メール送信のアカウント（`barra` のみ）

## 実行

`kick_zaiko_list.bat`、`kick_zaiko_ocnk.bat`、`kick_zaiko_rms.bat`、`kick_zaiko_barra.bat` をタスクスケジューラに登録する。

- `kick_zaiko_barra.bat` は月に 1 回

- `kick_zaiko_ocnk.bat` は、`kick_dl_ocnk.bat` の後、`kick_up_ocnk.bat` の前に動かす
- 土日は動かさない（Web の注文で減った在庫を更新しないため）

## 抽出（reportjob.py）

現行の 国内発注在庫.xlsm・残少在庫確認.xlsm・大会倉庫.xlsm・竹島さん売上.xlsm の置き換え。
商品の一覧・宛先などの設定は、今の Excel をそのまま読む（Excel 側は手で直し続ける）。
DB 関数は `db/20261124_chusyutsu.sql`。

| ジョブ | 内容 | 現行 | 起動 |
|---|---|---|---|
| `hacchu` | 発注一覧シートの商品の発注点（12 か月の出荷の月平均×1.2）・受注可・発注残を計算し、結果を xlsx に書く。発注点に届いた商品をメール（仕入先 010051 は江崎さん、ほかは菖蒲池さん・大谷さん） | 国内発注在庫.xlsm `Hacchu` | `kick_report_hacchu.bat` 毎日 |
| `hori` | 堀商店（000009）の発注残を FAX 用の xlsx にして FAX フォルダへ置く（見出しは Hori シートを写す） | 国内発注在庫.xlsm `Hori_Zan` | `kick_report_hori.bat` |
| `zansho` | 今日出荷して朝来の在庫が 5 以下の商品をチャットワークへ送る | 残少在庫確認.xlsm `main` | `kick_report_zansho.bat` 毎日（出荷の後） |
| `kireru` | 朝来で在庫 ≦ 受注残の商品（対象品番シートにあり、代わりの在庫も無いもの）を 在庫切れ対応リスト.xlsx に書く | 残少在庫確認.xlsm `zero` | `kick_report_kireru.bat` 毎日 |
| `taikai` | data シートの大会倉庫ごとに、在庫のある商品を担当者へメール | 大会倉庫.xlsm `main` | `kick_report_taikai.bat` |
| `uriage` | 営業担当の 3 年分（前月末まで）の売上明細と商品×月の集計をメールに添付 | 竹島さん売上.xlsm `main` | `kick_report_uriage.bat` 月 1 回 |

- 結果の xlsx は、国内発注在庫.xlsm には書き戻さない（図の入ったシートを壊さないため）。`hacchu` の 2 つ目の引数のファイルに書く。
- `zansho` は環境変数 `MWSYS_CHATWORK_TOKEN` にチャットワークの API トークンを設定する。
- `kick_report_*.bat` のファイルの場所は、現行のマクロと同じ。国内発注在庫.xlsm・大会倉庫.xlsm・在庫切れ対応リスト.xlsx は `C:\mwj\MWJAPAN\mwjapan - share\system\batch\在庫連携\`、堀商店の FAX は `\\192.168.30.133\share\asago宛FAX\horishoten\`。国内発注在庫の結果は同じフォルダの 国内発注在庫_結果.xlsx に書く。
- 現行の Excel のマクロには DB・メール・チャットワークのパスワードやトークンがそのまま書いてある。置き換えた後は Excel を消すか、パスワードを変える。

## テスト

```bash
python -m unittest test_zaikolib test_reportjob
```
