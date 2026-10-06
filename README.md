# 日本地理クエスト（中1地理 試験対策アプリ）

LINEの中で開く、スマホ向けのクイズRPGです。ザコ敵5体（1問ずつ）→ ボス（7問ぶんのHP）で1ステージ12問。

| 範囲 | 内容 |
|---|---|
| ①中国・四国 | 県の位置・地形・農業・漁業・工業・都市と農村 |
| ②近畿 | 県の位置・地形・産業・世界遺産 |
| ③中部 | 県の位置・地形のみ |
| 漢字どうじょう | 県名・県庁所在地の読みと書き（むずかしい漢字は多めに出題） |
| 県名ずかん | 白地図＋読み方＋覚え方メモ |
| にがて復習 | まちがえた問題だけをもう一度 |

出題形式は「4択」「白地図タップ」「色つき県を当てる」「漢字を並べて書く」の4種類。

## フォルダ構成

```
geo-quest/
├─ docs/                  ← 公開するファイル（GitHub Pagesがここを配信）
│   ├─ index.html / style.css / app.js
│   ├─ config.js          ← LIFF IDを貼る場所
│   └─ data/data.js       ← build.py が自動生成（直接編集しない）
│   └─ data/maps.js       ← 白地図の配置データ
└─ tools/
    ├─ questions.csv      ← 問題（Excelで編集OK）
    ├─ prefectures.csv    ← 県名・読み・漢字の覚え方
    └─ build.py           ← CSV → data.js に変換（Python）
```

## 問題を直す・増やす

1. `tools/questions.csv` をExcelで開いて編集（保存は「CSV UTF-8」形式）
   - `type` は `choice`（4択）か `map`（地図タップ。`answer` は県名だけ。例：`滋賀`）
   - `level` は 1（ザコ向け）か 2（ボス向け）
2. ターミナルで `python tools/build.py` を実行 → ミスがあれば場所を教えてくれます
3. `docs/` を公開し直す

> **大事：** 問題は一般的な中学地理の内容で作ってあります。学校の教科書・ワーク・プリントと表現や答えが違うところ（例：三重県を近畿に入れるか、東海の県の範囲など）は、CSVを直してください。

## 自分のパソコンで試す

```
cd docs
python -m http.server 8000
```
ブラウザで http://localhost:8000 を開くと遊べます。

## 公開（デプロイ）の手順

### A. GitHub Pagesで公開（無料）
1. GitHubでリポジトリを作り、このフォルダの中身をアップロード
2. Settings → Pages → Branch を `main`、フォルダを `/docs` にして Save
3. `https://（ユーザー名）.github.io/（リポジトリ名）/` が表示されたらOK（HTTPSが必須。GitHub Pagesは標準でHTTPS）

### B. LINEで開けるようにする（LIFF）
1. [LINE Developers](https://developers.line.biz/) にログイン → プロバイダー作成
2. 「LINEログイン」チャネルを作成
3. チャネルの「LIFF」タブ → 追加
   - Size: Full / Endpoint URL: Aの公開URL
   - Scope: `profile`（名前表示用）、Bot link feature は Off
   - 「Chat message write」にチェックを入れると、結果をトークに送るボタンが使えます（任意）
4. 作成されたLIFF IDを `docs/config.js` に貼る → 再アップロード
5. `https://liff.line.me/（LIFF ID）` をお子さんのLINEに送る（自分宛てのKeepメモに保存して開いてもOK）
6. 開いたら、LINEのトーク画面右上のメニュー等から「ホーム画面に追加」できる端末もあります。リンクをトークの上部に固定（ピン留め）しておくと便利です。

LINEの公式アカウント（無料のコミュニケーションプラン）のリッチメニューにLIFFのURLを設定すると、トークから1タップで起動できます。ただし、お子さん1人だけの利用なら上のKeep・ピン留めで十分です。

### 代わりのホスティング
Netlify / Cloudflare Pages / Vercel でも、`docs` フォルダをドラッグ＆ドロップするだけで公開できます。

## 保存データについて
レベルやクリア記録は、端末（LINEアプリ内ブラウザ）の保存領域に入ります。LINEのキャッシュ削除や機種変更で消えることがあります。

## 白地図について
県境の形のデータを取得できなかったため、現在は「位置関係を四角で表したタイル地図」です。本物の県境の形に変えたいときは、県ごとの`<path>`を持つ白地図SVG（国土数値情報などをもとにしたもの）を用意し、`app.js` の `mapSVG()` を差しかえてください。

## このアプリを使ってPythonを学ぶには
- `tools/build.py` … CSVを読む（`csv.DictReader`）、データをチェックする、JSONに書き出す、という基本がそろっています。
- 問題を10個増やす → `build.py` を実行 → 画面で確認、という流れが、そのまま練習になります。
