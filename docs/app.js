/* 日本地理クエスト  app.js
 *
 * 全体の流れ（Pythonで言うと「状態(state)を持つ小さなゲームループ」）
 *   1) データ読み込み  : data/data.js (問題・県データ) と data/maps.js (白地図)
 *   2) 状態(S, G)      : S = セーブデータ(ずっと残る)  G = いまの冒険(1回ごと)
 *   3) render()        : 状態から画面のHTMLを作って表示する
 *   4) クリックの処理  : data-act="..." のボタンが押されたら状態を変えて render() し直す
 */
(function () {
  'use strict';

  const D = window.GEO_DATA;
  const MAPS = window.GEO_MAPS;
  const CFG = window.APP_CONFIG || {};
  const app = document.getElementById('app');

  const MAX_HEARTS = 5; // ハートの数
  const MOB_COUNT = 5;  // ザコ敵の数（1問ずつ）
  const BOSS_HP = 7;    // ボスの体力（7問ぶん）
  const DOJO_COUNT = 10;

  // ---------- 地方ごとの設定 ----------
  const REGIONS = {
    1: {
      id: 1, short: '①中国・四国', name: '中国・四国地方', icon: '🌊',
      scope: '県の位置・地形・農業・漁業・工業・都市と農村',
      cats: ['農業', '漁業', '工業', '都市と農村', '地形', '位置', '漢字'],
      boss: { name: '瀬戸内の大ダコ王', emoji: '🐙' }
    },
    2: {
      id: 2, short: '②近畿', name: '近畿地方', icon: '🏯',
      scope: '県の位置・地形・産業・世界遺産',
      cats: ['地形', '産業', '世界遺産', '位置', '漢字'],
      boss: { name: '関西の鬼大王', emoji: '👹' }
    },
    3: {
      id: 3, short: '③中部', name: '中部地方', icon: '🗻',
      scope: '県の位置・地形',
      cats: ['地形', '位置', '漢字'],
      boss: { name: 'アルプスのドラゴン', emoji: '🐉' }
    }
  };

  // 漢字がむずかしい県名（ずかんで目印をつけ、どうじょうで多めに出す）
  const HARD = new Set(['愛媛', '香川', '徳島', '鳥取', '島根', '滋賀', '兵庫', '大阪', '奈良',
    '和歌山', '新潟', '富山', '山梨', '岐阜', '静岡', '福井']);

  const MOBS = [
    ['スライム', '👾'], ['ゴブリン', '👺'], ['ガイコツ', '💀'], ['コウモリ', '🦇'], ['ヘビ', '🐍'],
    ['おばけ', '👻'], ['サソリ', '🦂'], ['オオカミ', '🐺'], ['カエル', '🐸'], ['ロボット', '🤖']
  ];
  const TITLES = ['みならい冒険者', 'かけだし勇者', '地図の旅人', '県名ハンター', '地形マスター',
    '日本地理の達人', '地理の大賢者', '伝説のちりはかせ'];
  const PRAISE = ['せいかい！', 'ナイス！', 'すごい！', 'その調子！', 'かんぺき！'];

  // ---------- 小さな道具 ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const sample = (a, n) => shuffle(a).slice(0, n);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  // ---------- セーブデータ(S) ----------
  const KEY = 'geoquest.v1';
  const defaults = () => ({
    name: '', xp: 0, correct: 0, answered: 0, sound: true,
    wrong: {},           // まちがえた問題 { id: 回数 }
    seen: {},            // 一度でも出た問題
    cleared: { 1: 0, 2: 0, 3: 0 },
    boss: { 1: 0, 2: 0, 3: 0 },
    bestStars: { 1: 0, 2: 0, 3: 0 }
  });
  function loadS() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
      return Object.assign(defaults(), raw);
    } catch (e) { return defaults(); }
  }
  function saveS() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* 保存できなくても遊べる */ } }
  let S = loadS();
  const level = () => Math.floor(S.xp / 100) + 1;
  const rankTitle = () => TITLES[Math.min(level() - 1, TITLES.length - 1)];

  // ---------- 音 ----------
  let ac = null;
  function tone(seq) {
    if (!S.sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      let t = ac.currentTime;
      seq.forEach((f) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'triangle'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        o.connect(g); g.connect(ac.destination);
        o.start(t); o.stop(t + 0.18);
        t += 0.12;
      });
    } catch (e) { /* 音が出なくてもOK */ }
  }

  // ---------- 白地図(SVG) ----------
  // o = { tap:タップできるか, hl:色をつける県, sel:選択中の県, ok:正解の県, ng:まちがえた県, names:県名を表示 }
  function mapSVG(region, o) {
    o = o || {};
    const M = MAPS[region], U = 64;
    let rows = 0;
    M.tiles.forEach((t) => { rows = Math.max(rows, t[2] + t[4]); });
    M.labels.forEach((l) => { rows = Math.max(rows, l[2] + 1); });
    let s = `<svg viewBox="0 0 ${M.cols * U} ${rows * U}" role="img" aria-label="白地図">`;
    M.labels.forEach((l) => {
      s += `<text class="sea" x="${(l[1] + l[3] / 2) * U}" y="${(l[2] + 0.5) * U + 5}" text-anchor="middle">${l[0]}</text>`;
    });
    M.tiles.forEach((t) => {
      const [name, c, r, w, h, grey] = t;
      let cls = 'tile';
      if (grey) cls += ' grey';
      else {
        if (o.tap) cls += ' tap';
        if (o.hl === name) cls += ' hl';
        if (o.sel === name) cls += ' sel';
        if (o.ok === name) cls += ' ok';
        if (o.ng === name) cls += ' ng';
      }
      const x = c * U + 3, y = r * U + 3, W = w * U - 6, H = h * U - 6;
      const showName = grey || o.names;
      s += `<g class="${cls}" data-act="tilemap" data-pref="${esc(name)}"${grey ? ' data-grey="1"' : ''}>` +
        `<rect x="${x}" y="${y}" width="${W}" height="${H}" rx="12"/>` +
        (showName ? `<text x="${x + W / 2}" y="${y + H / 2 + 5}" text-anchor="middle">${esc(name)}</text>` : '') +
        `</g>`;
    });
    return s + '</svg>';
  }

  // ---------- 問題づくり ----------
  // 問題オブジェクトの形:
  //  { id, region, cat, lv, type: 'choice'|'map'|'maphl'|'write', q, a, e, choices?, hl?, kana?, tiles? }
  function csvQuestions(region) {
    return D.questions.filter((q) => q.region === region).map((q) => {
      const o = { id: q.id, region, cat: q.cat, lv: q.lv, type: q.type, q: q.q, a: q.a, e: q.e };
      if (q.type === 'choice') o.choices = shuffle([q.a].concat(q.w));
      return o;
    });
  }
  // 県データから自動で作る問題（位置・漢字・県庁所在地）
  function genQuestions(region) {
    const ps = D.prefs.filter((p) => p.region === region);
    const out = [];
    ps.forEach((p) => {
      const others = ps.filter((x) => x.name !== p.name);
      const full = p.name + p.suffix;
      const info = `${full}（${p.kana}）。県庁所在地は${p.capital}。`;
      // 位置: 色のついた県の名前をえらぶ
      out.push({
        id: `g-hl-${p.name}`, region, cat: '位置', lv: 1, type: 'maphl', hl: p.name,
        q: '地図で色がついている県はどこ？', a: full, e: info,
        choices: shuffle([full].concat(sample(others, 3).map((x) => x.name + x.suffix)))
      });
      // 位置: 県名をタップ
      out.push({
        id: `g-tap-${p.name}`, region, cat: '位置', lv: 1, type: 'map',
        q: `${full}はどこ？ 地図でタップして「けってい」`, a: p.name, e: info
      });
      // 漢字: 読み
      const rw = shuffle(p.wrongKana.concat(sample(others.map((x) => x.kana), 1)));
      out.push({
        id: `g-read-${p.name}`, region, cat: '漢字', lv: 1, type: 'choice',
        q: `「${p.name}」県は、何と読む？`, a: p.kana, e: `${full}は「${p.kana}」。${p.mnemonic}`,
        choices: shuffle([p.kana].concat(rw.filter((k) => k !== p.kana).slice(0, 3)))
      });
      // 漢字: 書き
      const chars = p.name.split('').concat(p.decoys);
      out.push({
        id: `g-write-${p.name}`, region, cat: '漢字', lv: 2, type: 'write', kana: p.kana,
        q: `「${p.kana}」県を漢字で書こう`, a: p.name, tiles: shuffle(chars), e: `${full}。${p.mnemonic}`
      });
      // 県庁所在地（県名とちがう名前のとき）
      if (p.capital.replace('市', '') !== p.name) {
        const otherCaps = others.filter((x) => x.capital !== p.capital);
        out.push({
          id: `g-cap-${p.name}`, region, cat: '漢字', lv: 2, type: 'choice',
          q: `${full}の県庁所在地はどこ？`, a: p.capital, e: `${full}の県庁所在地は${p.capital}（${p.capitalKana}）。`,
          choices: shuffle([p.capital].concat(sample(otherCaps, 3).map((x) => x.capital)))
        });
        out.push({
          id: `g-capread-${p.name}`, region, cat: '漢字', lv: 2, type: 'choice',
          q: `県庁所在地「${p.capital}」は、何と読む？`, a: p.capitalKana, e: `${p.capital}は「${p.capitalKana}」。${full}の県庁所在地。`,
          choices: shuffle([p.capitalKana].concat(sample(otherCaps, 3).map((x) => x.capitalKana)))
        });
      }
    });
    return out;
  }
  const buildPool = (region) => csvQuestions(region).concat(genQuestions(region));

  function weight(q) {
    let w = 1 + 3 * (S.wrong[q.id] || 0);
    if (!S.seen[q.id]) w += 1;
    if (q.cat === '漢字' && q.id.indexOf('g-') === 0) {
      const nm = q.id.split('-').slice(2).join('-');
      if (HARD.has(nm)) w += 1.5; // むずかしい漢字の県は多めに
    }
    return w;
  }
  function weightedPick(list) {
    const ws = list.map(weight), sum = ws.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum;
    for (let i = 0; i < list.length; i++) { r -= ws[i]; if (r <= 0) return list[i]; }
    return list[list.length - 1];
  }

  // 1ステージ(12問)をつくる。ザコ5問は易しめ、ボス7問は難しめ＋分野をばらけさせる
  function buildStageSet(region) {
    const pool = buildPool(region);
    const cats = REGIONS[region].cats;
    let order = [];
    while (order.length < MOB_COUNT + BOSS_HP) order = order.concat(shuffle(cats));
    const used = new Set();
    const out = [];
    for (let i = 0; i < MOB_COUNT + BOSS_HP; i++) {
      const boss = i >= MOB_COUNT;
      let cand = pool.filter((q) => q.cat === order[i] && !used.has(q.id));
      if (!cand.length) cand = pool.filter((q) => !used.has(q.id));
      const pref = cand.filter((q) => q.lv === (boss ? 2 : 1));
      const q = weightedPick(pref.length ? pref : cand);
      used.add(q.id);
      out.push(q);
    }
    return { qs: out, pool };
  }
  function pickReplacement(g, likeCat) {
    const usedIds = new Set(g.qs.map((q) => q.id));
    let cand = g.pool.filter((q) => !usedIds.has(q.id) && q.cat === likeCat);
    if (!cand.length) cand = g.pool.filter((q) => !usedIds.has(q.id));
    if (!cand.length) cand = g.pool;
    const lv2 = cand.filter((q) => q.lv === 2);
    const q = weightedPick(lv2.length ? lv2 : cand);
    // 同じ問題の選択肢を作り直す（見た目を少し変える）
    return Object.assign({}, q, q.choices ? { choices: shuffle(q.choices) } : {}, q.tiles ? { tiles: shuffle(q.tiles) } : {});
  }

  // ---------- いまの冒険(G) ----------
  let G = null;
  let view = 'home';
  let zukanRegion = 1;
  let modal = null;
  let inLineClient = false;

  function startStage(region) {
    const set = buildStageSet(region);
    G = {
      kind: 'stage', region, qs: set.qs, pool: set.pool, i: 0, hearts: MAX_HEARTS, combo: 0, maxCombo: 0,
      bossHP: BOSS_HP, answered: false, ok: false, sel: null, slots: [], fx: '', msg: '',
      mobs: Array.from({ length: MOB_COUNT }, () => pick(MOBS)), log: [], missed: [], gotXP: 0, lvBefore: level()
    };
    view = 'battle';
    render();
  }
  function startDojo(region) { // region: 0 = ぜんぶ
    let pool = [];
    (region ? [region] : [1, 2, 3]).forEach((r) => {
      pool = pool.concat(genQuestions(r).filter((q) => q.cat === '漢字'));
    });
    const qs = [];
    const used = new Set();
    while (qs.length < DOJO_COUNT && used.size < pool.length) {
      const q = weightedPick(pool.filter((x) => !used.has(x.id)));
      used.add(q.id); qs.push(q);
    }
    startPractice('dojo', region, qs);
  }
  function startReview() {
    let pool = [];
    [1, 2, 3].forEach((r) => { pool = pool.concat(buildPool(r)); });
    const wrongPool = pool.filter((q) => S.wrong[q.id]);
    const qs = sample(wrongPool, DOJO_COUNT);
    if (!qs.length) return;
    startPractice('review', 0, qs);
  }
  function startPractice(kind, region, qs) {
    G = {
      kind, region, qs, pool: [], i: 0, hearts: MAX_HEARTS, combo: 0, maxCombo: 0, bossHP: 0,
      answered: false, ok: false, sel: null, slots: [], fx: '', msg: '', mobs: [], log: [], missed: [],
      gotXP: 0, lvBefore: level(), score: 0
    };
    view = 'battle';
    render();
  }

  const curQ = () => G.qs[G.i];
  const isBossPhase = () => G.kind === 'stage' && G.i >= MOB_COUNT;

  // ---------- 答え合わせ ----------
  function answer(ok, given) {
    if (G.answered) return;
    const q = curQ();
    G.answered = true; G.ok = ok; G.given = given;
    S.answered++; S.seen[q.id] = 1;
    G.msg = '';
    if (ok) {
      S.correct++; S.xp += 10; G.gotXP += 10; G.score = (G.score || 0) + 1;
      if (S.wrong[q.id]) { S.wrong[q.id]--; if (S.wrong[q.id] <= 0) delete S.wrong[q.id]; }
      G.combo++; G.maxCombo = Math.max(G.maxCombo, G.combo);
      if (G.kind === 'stage') {
        if (isBossPhase()) G.bossHP = Math.max(0, G.bossHP - 1);
        if (G.combo % 3 === 0 && G.hearts < MAX_HEARTS) { G.hearts++; G.msg = '3連続せいかい！ ハートが1つ回復したよ'; }
        G.fx = isBossPhase() ? 'hit' : 'defeated';
      }
      tone([660, 880]);
    } else {
      S.wrong[q.id] = (S.wrong[q.id] || 0) + 1;
      G.combo = 0;
      G.missed.push(q);
      if (G.kind === 'stage') {
        G.hearts--;
        G.fx = 'attack';
        if (isBossPhase() && G.qs.length < 24) G.qs.push(pickReplacement(G, q.cat)); // ボス戦は出し直し
      }
      tone([240, 170]);
    }
    saveS();
    render();
    const fb = document.getElementById('fb');
    if (fb) fb.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function next() {
    if (!G.answered) return;
    if (G.kind === 'stage') {
      if (G.hearts <= 0) return finish('lose');
      if (isBossPhase() && G.bossHP <= 0) return finish('win');
    }
    G.i++;
    if (G.i >= G.qs.length) return finish(G.kind === 'stage' ? (G.bossHP <= 0 ? 'win' : 'lose') : 'done');
    G.answered = false; G.sel = null; G.slots = []; G.fx = ''; G.msg = '';
    render();
    window.scrollTo(0, 0);
  }

  function finish(result) {
    G.result = result;
    if (G.kind === 'stage' && result === 'win') {
      const r = G.region;
      S.cleared[r]++; S.boss[r]++;
      S.xp += 80; G.gotXP += 80;
      G.stars = G.hearts >= 5 ? 3 : G.hearts >= 3 ? 2 : 1;
      S.bestStars[r] = Math.max(S.bestStars[r] || 0, G.stars);
      tone([523, 659, 784, 1047]);
    } else if (result === 'lose') {
      tone([300, 240, 180]);
    } else if (result === 'done') {
      tone([523, 659, 784]);
    }
    G.lvAfter = level();
    saveS();
    view = 'result';
    render();
    window.scrollTo(0, 0);
  }

  // ---------- 画面: ホーム ----------
  function pct() { return S.xp % 100; }
  function homeHTML() {
    const wrongCount = Object.keys(S.wrong).length;
    const name = S.name || 'ぼうけんしゃ';
    return `
    <div class="title"><h1>🗺️ 日本地理クエスト</h1><p>ザコを倒して、ボスにちょうせん！</p></div>
    <div class="stack">
      <div class="card player">
        <div class="av">🧙</div>
        <div class="meta">
          <div class="nm">${esc(name)}</div>
          <div class="rank">Lv.${level()}　${esc(rankTitle())}</div>
          <div class="xpbar"><i style="width:${pct()}%"></i></div>
        </div>
      </div>
      ${[1, 2, 3].map((r) => {
        const R = REGIONS[r];
        const stars = '★'.repeat(S.bestStars[r] || 0) + '☆'.repeat(3 - (S.bestStars[r] || 0));
        return `<button class="card stage" data-act="stage" data-r="${r}">
          <div class="ic">${R.icon}</div>
          <div class="tx"><h3>${R.short}</h3><div class="scope">${R.scope}</div>
            <div class="medals">${R.boss.emoji} ボス討伐 ${S.boss[r]}回　${stars}</div></div>
          <div class="go">▶</div></button>`;
      }).join('')}
      <div class="menu-grid">
        <button class="btn blue" data-act="dojo">📝 漢字どうじょう</button>
        <button class="btn green" data-act="zukan">📖 県名ずかん</button>
      </div>
      <button class="btn sub" data-act="review" ${wrongCount ? '' : 'disabled'}>🔥 にがて復習（${wrongCount}問）</button>
    </div>
    <div class="foot">
      <button data-act="sound">${S.sound ? '🔊 音: ON' : '🔇 音: OFF'}</button>
      <button data-act="resetAsk">セーブデータを消す</button>
    </div>`;
  }

  // ---------- 画面: 漢字どうじょう(メニュー) ----------
  function dojoMenuHTML() {
    return `
    <div class="topbar"><button class="quit" data-act="home">← もどる</button></div>
    <div class="card stack">
      <h2>📝 漢字どうじょう</h2>
      <p class="small" style="margin:0">県名や県庁所在地の読み・書きを、10問れんしゅう。ハートは減らないよ。むずかしい漢字の県は多めに出ます。</p>
      <button class="btn" data-act="dojoStart" data-r="0">ぜんぶの地方</button>
      <button class="btn sub" data-act="dojoStart" data-r="1">①中国・四国</button>
      <button class="btn sub" data-act="dojoStart" data-r="2">②近畿</button>
      <button class="btn sub" data-act="dojoStart" data-r="3">③中部</button>
    </div>`;
  }

  // ---------- 画面: ずかん ----------
  function zukanHTML() {
    const ps = D.prefs.filter((p) => p.region === zukanRegion);
    return `
    <div class="topbar"><button class="quit" data-act="home">← もどる</button></div>
    <div class="tabs">${[1, 2, 3].map((r) => `<button class="${r === zukanRegion ? 'on' : ''}" data-act="ztab" data-r="${r}">${REGIONS[r].short}</button>`).join('')}</div>
    <div class="maparea">${mapSVG(zukanRegion, { names: true })}</div>
    <div>${ps.map((p) => `
      <div class="card pcard">
        <div class="nm">${esc(p.name)}</div>
        <div>
          <div class="kn">${esc(p.name + p.suffix)}（${esc(p.kana)}）${HARD.has(p.name) ? ' <span class="tag warn">むずかしい漢字</span>' : ''}</div>
          <div class="mn">💡 ${esc(p.mnemonic)}</div>
          <div class="small">県庁所在地：${esc(p.capital)}（${esc(p.capitalKana)}）</div>
        </div>
      </div>`).join('')}</div>`;
  }

  // ---------- 画面: バトル ----------
  function heartsHTML() {
    return '❤️'.repeat(Math.max(0, G.hearts)) + '🖤'.repeat(Math.max(0, MAX_HEARTS - G.hearts));
  }
  function arenaHTML() {
    if (G.kind !== 'stage') return '';
    const R = REGIONS[G.region];
    const boss = isBossPhase();
    const mob = G.mobs[G.i];
    const emoji = boss ? R.boss.emoji : mob[1];
    const name = boss ? `ボス：${R.boss.name}` : `ザコ：${mob[0]}`;
    let cls = 'monster' + (boss ? ' boss' : '');
    if (G.answered) cls += ' ' + G.fx;
    const fx = G.answered ? (G.ok ? (boss ? '💥' : '✨') : '💢') : '';
    const hp = boss ? `<div class="hp" aria-label="ボスのHP"><i style="width:${(G.bossHP / BOSS_HP) * 100}%"></i></div>` : '';
    return `<div class="arena">
      <div class="name">${esc(name)}${boss ? `　HP ${G.bossHP}/${BOSS_HP}` : ''}</div>
      <div class="${cls}">${emoji}</div>${hp}
      <div class="fx ${fx ? 'show' : ''}">${fx}</div></div>`;
  }
  function progressHTML() {
    if (G.kind === 'stage') {
      let s = '';
      for (let k = 0; k < MOB_COUNT + BOSS_HP; k++) {
        const isBoss = k >= MOB_COUNT;
        const done = k < G.i || (k === G.i && G.answered && G.ok);
        s += `<i class="${isBoss ? 'boss' : 'mob'}${done ? ' done' : ''}${k === G.i ? ' now' : ''}"></i>`;
      }
      return `<div class="progress">${s}</div>`;
    }
    return `<div class="progress">${G.qs.map((_, k) => `<i class="mob${k < G.i || (k === G.i && G.answered) ? ' done' : ''}${k === G.i ? ' now' : ''}"></i>`).join('')}</div>`;
  }
  function questionBodyHTML(q) {
    const done = G.answered;
    if (q.type === 'choice' || q.type === 'maphl') {
      const long = q.choices.some((c) => c.length > 9);
      const map = q.type === 'maphl' ? `<div class="maparea">${mapSVG(q.region, { hl: q.hl, names: done })}</div>` : '';
      return map + `<div class="choices ${long ? 'one' : ''}">${q.choices.map((c, k) => {
        let cls = 'choice';
        if (done) {
          if (c === q.a) cls += ' ok';
          else if (c === G.given) cls += ' ng';
          else cls += ' dim';
        }
        return `<button class="${cls}" data-act="choose" data-k="${k}" ${done ? 'disabled' : ''}>${esc(c)}</button>`;
      }).join('')}</div>`;
    }
    if (q.type === 'map') {
      const o = { tap: !done, sel: G.sel, names: done };
      if (done) { o.ok = q.a; if (!G.ok) o.ng = G.given; }
      return `<div class="maparea">${mapSVG(q.region, o)}</div>
        ${done ? '' : `<button class="btn" data-act="decide" ${G.sel ? '' : 'disabled'}>${G.sel ? 'これに けってい！' : '地図をタップしてね'}</button>`}`;
    }
    if (q.type === 'write') {
      const need = q.a.length;
      const slots = Array.from({ length: need }, (_, k) => {
        const ti = G.slots[k];
        const ch = ti === undefined ? '' : esc(q.tiles[ti]);
        let cls = 'slot' + (ch ? ' filled' : '');
        if (done) cls += G.ok ? ' ok' : ' ng';
        return `<button class="${cls}" data-act="kslot" data-k="${k}" ${done ? 'disabled' : ''}>${ch}</button>`;
      }).join('');
      const tiles = q.tiles.map((t, k) => `<button class="ktile ${G.slots.indexOf(k) >= 0 ? 'used' : ''}" data-act="ktile" data-k="${k}" ${done ? 'disabled' : ''}>${esc(t)}</button>`).join('');
      return `<div class="kread">${esc(q.kana)}</div>
        <div class="slots">${slots}</div>
        <div class="tiles">${tiles}</div>
        ${done ? '' : `<div style="margin-top:12px"><button class="btn sub" data-act="kback">1文字もどす</button></div>`}`;
    }
    return '';
  }
  function feedbackHTML(q) {
    if (!G.answered) return '';
    const boss = isBossPhase();
    let head, extra = '';
    if (G.ok) {
      head = pick(PRAISE);
      if (G.kind === 'stage') {
        extra = boss ? (G.bossHP > 0 ? `ボスに1ダメージ！（のこり HP ${G.bossHP}）` : 'ボスをたおした！！') : 'ザコをたおした！';
      }
    } else {
      head = 'ざんねん…';
      if (G.kind === 'stage') {
        extra = `敵の反撃！ ハートが1つ減った。${boss ? 'ボス戦はべつの問題で再ちょうせん！' : ''}`;
      }
    }
    const last = G.kind === 'stage' && (G.hearts <= 0 || (boss && G.bossHP <= 0));
    const btn = last ? 'けっかを見る' : 'つぎへ';
    return `<div id="fb" class="feedback ${G.ok ? 'ok' : 'ng'}">
      <b class="big">${G.ok ? '⭕' : '❌'} ${head}</b>
      ${G.ok ? '' : `正解は <span class="ans">${esc(q.a)}</span><br>`}
      ${esc(q.e || '')}
      ${extra ? `<div style="margin-top:6px;font-weight:700">${esc(extra)}</div>` : ''}
      ${G.msg ? `<div style="margin-top:4px;font-weight:700;color:#1f7a45">💚 ${esc(G.msg)}</div>` : ''}
    </div>
    <div style="margin-top:12px"><button class="btn green" data-act="next">${btn}</button></div>`;
  }
  function battleHTML() {
    const q = curQ();
    const boss = isBossPhase();
    const label = G.kind === 'stage' ? `${boss ? 'ボス戦' : 'ザコ戦'}　${q.cat}` : `${G.kind === 'dojo' ? '漢字どうじょう' : 'にがて復習'}　${G.i + 1}/${G.qs.length}`;
    return `
    <div class="topbar">
      <button class="quit" data-act="quitAsk">やめる</button>
      <div class="hearts">${G.kind === 'stage' ? heartsHTML() : `せいかい ${G.score || 0}`}</div>
      <div class="combo">${G.combo >= 2 ? `🔥${G.combo}連続` : '　'}</div>
    </div>
    ${progressHTML()}
    ${arenaHTML()}
    <div class="card qcard">
      <span class="qcat ${boss ? 'boss' : ''}">${esc(label)}</span>
      <div class="qtext">${esc(q.q)}</div>
      ${questionBodyHTML(q)}
      ${feedbackHTML(q)}
    </div>`;
  }

  // ---------- 画面: 結果 ----------
  function resultHTML() {
    const g = G;
    const R = g.region ? REGIONS[g.region] : null;
    let head = '', emoji = '', stars = '';
    if (g.kind === 'stage') {
      if (g.result === 'win') {
        head = `${R.boss.name}をたおした！`; emoji = '🏆';
        stars = `<div class="stars">${'★'.repeat(g.stars)}${'☆'.repeat(3 - g.stars)}</div>`;
      } else { head = 'やられてしまった…'; emoji = '💫'; }
    } else {
      head = `${g.score}問 せいかい！`; emoji = g.score >= g.qs.length - 1 ? '🎉' : '👍';
    }
    const lvUp = g.lvAfter > g.lvBefore ? `<div class="levelup">🎊 レベルアップ！ Lv.${g.lvAfter}　${esc(rankTitle())}</div>` : '';
    const missed = g.missed.length ? `
      <div class="card"><h3 style="margin-bottom:6px">📌 まちがえた問題（${g.missed.length}）</h3>
      ${g.missed.map((q) => `<div class="review-item"><div class="qq">${esc(q.q)}</div>正解：<b>${esc(q.a)}</b><br><span class="small">${esc(q.e || '')}</span></div>`).join('')}
      <p class="small" style="margin:6px 0 0">まちがえた問題は「にがて復習」にたまるよ。</p></div>` : '';
    const stat = g.kind === 'stage'
      ? `ハート ${g.hearts}/${MAX_HEARTS}　さいだい ${g.maxCombo}連続　+${g.gotXP} XP`
      : `${g.score}/${g.qs.length}問 せいかい　+${g.gotXP} XP`;
    return `
    <div class="result stack">
      <div class="card stack">
        <div class="bigemoji">${emoji}</div>
        <h2>${esc(head)}</h2>${stars}
        <div class="center small">${stat}</div>
        ${lvUp}
      </div>
      ${missed}
      <div class="stack">
        ${g.kind === 'stage' ? `<button class="btn" data-act="retry">${g.result === 'win' ? 'もういちど ぼうけん' : 'もういちど ちょうせん'}</button>` : ''}
        ${g.kind === 'dojo' ? `<button class="btn" data-act="dojoStart" data-r="${g.region}">もう10問</button>` : ''}
        ${inLineClient ? '<button class="btn blue" data-act="share">LINEでけっかを送る</button>' : ''}
        <button class="btn sub" data-act="home">ホームへ</button>
      </div>
    </div>`;
  }

  // ---------- 描画 ----------
  function modalHTML() {
    if (!modal) return '';
    return `<div class="modal"><div class="card">
      <h3>${esc(modal.title)}</h3><p style="margin:8px 0 0">${esc(modal.text)}</p>
      <div class="row"><button class="btn sub" data-act="modalNo">${esc(modal.no)}</button>
      <button class="btn" data-act="modalYes">${esc(modal.yes)}</button></div></div></div>`;
  }
  function render() {
    let h = '';
    if (view === 'home') h = homeHTML();
    else if (view === 'dojoMenu') h = dojoMenuHTML();
    else if (view === 'zukan') h = zukanHTML();
    else if (view === 'battle') h = battleHTML();
    else if (view === 'result') h = resultHTML();
    app.innerHTML = h + modalHTML();
  }

  // ---------- クリック処理 ----------
  app.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    switch (act) {
      case 'home': view = 'home'; G = null; break;
      case 'stage': startStage(+el.dataset.r); return;
      case 'dojo': view = 'dojoMenu'; break;
      case 'dojoStart': startDojo(+el.dataset.r); return;
      case 'review': startReview(); return;
      case 'zukan': view = 'zukan'; break;
      case 'ztab': zukanRegion = +el.dataset.r; break;
      case 'sound': S.sound = !S.sound; saveS(); break;
      case 'choose': {
        const q = curQ(); if (G.answered) return;
        const given = q.choices[+el.dataset.k];
        answer(given === q.a, given); return;
      }
      case 'tilemap': {
        if (!G || view !== 'battle') return; // ずかんの地図は見るだけ
        const q = curQ();
        if (!q || q.type !== 'map' || G.answered || el.dataset.grey) return;
        G.sel = el.dataset.pref; break;
      }
      case 'decide': {
        const q = curQ(); if (G.answered || !G.sel) return;
        answer(G.sel === q.a, G.sel); return;
      }
      case 'ktile': {
        const q = curQ(); if (G.answered) return;
        const k = +el.dataset.k;
        if (G.slots.indexOf(k) >= 0 || G.slots.length >= q.a.length) return;
        G.slots.push(k);
        if (G.slots.length === q.a.length) {
          const word = G.slots.map((i) => q.tiles[i]).join('');
          answer(word === q.a, word); return;
        }
        break;
      }
      case 'kslot': {
        if (G.answered) return;
        G.slots.splice(+el.dataset.k); break; // その文字以降をまとめて外す
      }
      case 'kback': if (!G.answered) G.slots.pop(); break;
      case 'next': next(); return;
      case 'retry': startStage(G.region); return;
      case 'quitAsk':
        modal = { title: 'ぼうけんを やめる？', text: 'ここまでの進行はリセットされるよ。', yes: 'やめる', no: 'つづける', onYes: () => { view = 'home'; G = null; } };
        break;
      case 'resetAsk':
        modal = { title: 'セーブデータを消す？', text: 'レベルやクリア記録、にがて問題がすべて消えます。', yes: '消す', no: 'やめとく', onYes: () => { S = defaults(); saveS(); } };
        break;
      case 'modalYes': { const m = modal; modal = null; if (m && m.onYes) m.onYes(); break; }
      case 'modalNo': modal = null; break;
      case 'share': shareResult(); return;
      default: return;
    }
    render();
  });

  function shareResult() {
    try {
      const g = G;
      const text = g.kind === 'stage'
        ? `日本地理クエスト【${REGIONS[g.region].short}】${g.result === 'win' ? 'ボスをたおした！' : 'ざんねん…'} ハート${g.hearts}/${MAX_HEARTS} Lv.${level()}`
        : `日本地理クエスト 漢字どうじょう ${g.score}/${g.qs.length}問せいかい！ Lv.${level()}`;
      liff.sendMessages([{ type: 'text', text }]).catch(() => {});
    } catch (e) { /* LINEの外では何もしない */ }
  }

  // ---------- LINE(LIFF)の準備 ----------
  async function initLiff() {
    try {
      if (!CFG.LIFF_ID || typeof liff === 'undefined') return;
      await liff.init({ liffId: CFG.LIFF_ID });
      inLineClient = liff.isInClient();
      if (liff.isLoggedIn()) {
        const p = await liff.getProfile();
        if (p && p.displayName) { S.name = p.displayName; saveS(); }
      }
      render();
    } catch (e) { console.warn('LIFFの初期化に失敗（ふつうのWebページとして動きます）', e); }
  }

  // テスト用に一部を公開（ふだんは使いません）
  window.__geo = { buildPool, genQuestions, buildStageSet, get G() { return G; }, get S() { return S; } };

  render();
  initLiff();
})();
