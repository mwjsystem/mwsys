const path = require('path');
const express = require('express');
const forceSsl = require('force-ssl-heroku');

// const exec = require('child_process').exec;
// サーバをインスタンス化する
const app = express();
// http ⇒ https リダイレクト
app.use(forceSsl);

const dist = `${__dirname}/dist/browser`;

// 画面の部品（ファイル名に版ごとのハッシュが付いた JS・CSS）は長く覚えてよい。
// index.html は毎回確かめさせる（古い index.html が残ると、新しい版を公開したあとに画面を開けなくなる。iPhone の Safari で起きる）
app.use(express.static(dist, {
  index: false,
  setHeaders: (res, file) => {
    if (/-[A-Z0-9]{8,}\.(js|css)$/i.test(file)) {
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.set('Cache-Control', 'no-cache');
    }
  }
}));

// 見つからない部品のファイル（古い版の JS など）は 404 にする
// （index.html を返すと、ブラウザは JS として読もうとして失敗し、原因が分かりにくくなる）。
// 画面の URL（伝票番号・商品コードなど）は拡張子が付かないので、部品の拡張子だけにする
app.get(/\.(js|mjs|css|map|json|png|jpe?g|gif|svg|ico|woff2?|ttf|txt|webmanifest)$/i, (req, res) => {
  res.status(404).set('Cache-Control', 'no-cache').send('Not Found');
});

// 画面の URL は index.html を返す（毎回確かめさせる）
app.get('/*', (req, res) => {
  res.set({ 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache, no-store, must-revalidate' });
  res.sendFile(path.join(dist, 'index.html'));
});
// サーバ起動
const server = app.listen(process.env.PORT || 8080, () => {
    const host = server.address().address;
    const port = server.address().port;
    console.log(`Listening at http://${host}:${port}`);
  });
