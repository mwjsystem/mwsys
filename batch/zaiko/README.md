# 在庫連携バッチ

現行の `★MW在庫表.xlsm` の置き換え。Excel を使わず、社内のバッチサーバーで動かす。

| ジョブ | 内容 | 現行 |
|---|---|---|
| `list` | 在庫表 `MW在庫一覧.xlsx` を作る | `main` と `Make_zip` の一覧作成 |
| `csv` | おちゃのこの `products.csv` を更新する | `Make_csv` |
| `rms` | 楽天の `normal-item.xlsx`、ANA Mall の `goods_stock.csv` を更新する | `Edit_rms` |

## 準備

```bash
pip install -r requirements.txt
```

サーバーの環境変数に次を設定する（ファイルには書かない）。

- `MWSYS_HASURA_SECRET`：Hasura の admin secret
- `MWSYS_SCHEMA`：テスト中は `test`。本番は設定しない
- `MWSYS_LOG`：`C:\mwj\MWJAPAN\mwjapan - share\system\batch\log.txt`

## 実行

`kick_zaiko_list.bat`、`kick_zaiko_ocnk.bat`、`kick_zaiko_rms.bat` をタスクスケジューラに登録する。

- `kick_zaiko_ocnk.bat` は、`kick_dl_ocnk.bat` の後、`kick_up_ocnk.bat` の前に動かす
- 土日は動かさない（Web の注文で減った在庫を更新しないため）

## テスト

```bash
python -m unittest test_zaikolib
```
