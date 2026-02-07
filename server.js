const path = require('path');
const express = require('express');
const forceSsl = require('force-ssl-heroku');
const cors = require('cors');
// const exec = require('child_process').exec;
// サーバをインスタンス化する 
const app = express();
// http ⇒ https リダイレクト
app.use(forceSsl);

// CORSエラー対策
app.use(cors({
    origin: '*mwsys*.herokuapp.com', //アクセス許可するオリジン
    credentials: true, //レスポンスヘッダーにAccess-Control-Allow-Credentials追加
    optionsSuccessStatus: 200 //レスポンスstatusを200に設定
}))

// 以下の設定だけで dist/index.html も返せてはいる
app.use(express.static(`${__dirname}/dist`));

// ルートへのアクセス時は念のため dist/index.html を確実に返すようにしておく
app.get('/*', (req, res) => {
  res.sendFile(path.join(`${__dirname}/dist/index.html`));
  res.set({ 'Access-Control-Allow-Origin': '*' });
});
// サーバ起動
const server = app.listen(process.env.PORT || 8080, () => {
    const host = server.address().address;
    const port = server.address().port;
    console.log(`Listening at http://${host}:${port}`);
  });