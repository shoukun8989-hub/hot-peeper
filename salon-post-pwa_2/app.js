// ---------------------------------------------------------------------------
// サロン投稿アシスタント（スマホ用）
//
//   iPhone / Android のブラウザで動く画面です。
//   ここではサロンボードを直接は触りません。写真と文章を用意して、
//   スプレッドシートの「順番待ち」に送るところまでを受け持ちます。
//   実際の登録は、店舗のPCに入れた拡張機能が引き取ります。
//
//   文章のつくり方（プロンプト）と項目の定義は、PCの拡張機能と同じ
//   lib/ の中身をそのまま読み込んでいます。片方だけずれることがありません。
// ---------------------------------------------------------------------------
import * as S from './lib/store.js';
import * as R from './lib/relay.js';
import { generate } from './lib/generate.js';

const APP_VERSION = '0.13.3';

const CFG_KEY = 'salonpost.cfg';
const MASTERS_KEY = 'salonpost.masters';

const LIMITS = {
  blog:  { title: 25, body: 1000, photos: 4 },
  style: { title: 30, body: 120,  photos: 3 },
};

const MODEL_FIELDS = ['hairVolume', 'hairQuality', 'thickness', 'curl', 'age', 'faceShape'];

const $ = (id) => document.getElementById(id);
const state = {
  postType: 'blog',
  photos: [],       // { dataUrl, name }
  result: null,     // 生成結果
  tags: [],
  sending: false,
};

let cfg = load(CFG_KEY, { url: '', token: '', storeId: '', sender: '' });
let masters = load(MASTERS_KEY, null);

function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}

// --- 画面の共通部品 ---------------------------------------------------------

let msgTimer = 0;
function say(text, kind = 'info', hold = false) {
  const el = $('msg');
  el.className = 'msg on ' + kind;
  el.textContent = text;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  clearTimeout(msgTimer);
  if (!hold) msgTimer = setTimeout(() => el.classList.remove('on'), 6000);
}
function hush() { clearTimeout(msgTimer); $('msg').classList.remove('on'); }

function show(id) {
  for (const s of document.querySelectorAll('section')) s.classList.toggle('on', s.id === id);
  for (const b of document.querySelectorAll('nav button')) b.classList.toggle('on', b.dataset.go === id);
  window.scrollTo(0, 0);
}

function fillSelect(el, items, { blank = '', value = '' } = {}) {
  el.innerHTML = '';
  if (blank !== null) {
    const o = document.createElement('option');
    o.value = ''; o.textContent = blank;
    el.appendChild(o);
  }
  for (const it of items) {
    const o = document.createElement('option');
    o.value = typeof it === 'string' ? it : it.value;
    o.textContent = typeof it === 'string' ? it : it.label;
    el.appendChild(o);
  }
  el.value = value || '';
}

// --- マスタ -----------------------------------------------------------------

function sync() { return { url: cfg.url, token: cfg.token }; }

function myStore() {
  if (!masters?.stores?.length) return null;
  return masters.stores.find((s) => s.id === cfg.storeId) || masters.stores[0];
}

/** マスタが揃っているか。足りなければ理由を返す */
function readiness() {
  if (!cfg.url || !cfg.token) return 'つなぎ先が未設定です。［設定］から登録してください。';
  if (!masters) return '店舗・スタッフの情報がまだありません。［設定］の「つないで読み込む」を押してください。';
  if (!masters.stores?.length) return 'PCの拡張機能に店舗が登録されていません。';
  return '';
}

function mappingFor(postType) { return masters?.mappings?.[postType] || null; }

function optionsOf(postType, key) {
  const def = (S.FIELD_DEFS[postType] || []).find((d) => d.key === key);
  if (!def) return [];
  return (S.optionsFor(mappingFor(postType), def) || []).filter((v) => v && v !== '—');
}

async function loadMasters() {
  const got = await R.getMasters(sync());
  masters = got;
  if (!save(MASTERS_KEY, got)) {
    say('情報は読み込めましたが、端末に保存できませんでした（保存容量が足りません）。', 'err');
  }
  if (!cfg.storeId && got.stores?.length) cfg.storeId = got.stores[0].id;
  return got;
}

// --- 写真 -------------------------------------------------------------------

/** iPhone の写真はそのままだと大きいので、長辺1280pxのJPEGに縮めてから送る */
function shrink(file, maxSide = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('写真を読み込めませんでした。')); };
    img.src = url;
  });
}

function renderPhotos() {
  const max = LIMITS[state.postType].photos;
  const box = $('thumbs');
  box.innerHTML = '';
  state.photos.forEach((p, i) => {
    const d = document.createElement('div');
    d.className = 'thumb';
    const img = document.createElement('img');
    img.src = p.dataUrl; img.alt = '';
    d.appendChild(img);
    if (state.postType === 'style') {
      const b = document.createElement('span');
      b.className = 'badge';
      b.textContent = S.IMAGE_POSITIONS[i] || '';
      d.appendChild(b);
    }
    const x = document.createElement('button');
    x.className = 'x'; x.type = 'button'; x.textContent = '×';
    x.setAttribute('aria-label', `${i + 1}枚目を外す`);
    x.onclick = () => { state.photos.splice(i, 1); renderPhotos(); };
    d.appendChild(x);
    box.appendChild(d);
  });
  if (state.photos.length < max) {
    const add = document.createElement('button');
    add.className = 'add'; add.type = 'button'; add.textContent = '＋';
    add.setAttribute('aria-label', '写真を追加');
    add.onclick = () => $('file').click();
    box.appendChild(add);
  }
  $('photoCount').textContent = `${state.photos.length} / ${max}`;
  $('photoNote').textContent = state.postType === 'style'
    ? '1枚目がFRONT、2枚目がSIDE、3枚目がBACKとして登録されます。順番が違うときは外して入れ直してください。'
    : '写真から文章をつくります。1枚でも構いません。';
}

// --- つくる画面 -------------------------------------------------------------

/**
 * 店舗で絞り込む。
 * ただし、絞った結果が空になるなら絞らない。
 * 選んでいる店舗が実際と違うだけで、選択肢が丸ごと消えてしまうのを防ぐため。
 */
function forStore(list, storeId) {
  const all = list || [];
  const mine = all.filter((r) => !r.storeId || r.storeId === storeId);
  return mine.length ? { rows: mine, narrowed: true } : { rows: all, narrowed: false };
}

function renderMake() {
  const store = myStore();
  $('hdStore').textContent = store ? store.name : '';

  const staff = forStore(masters?.staff, store?.id);
  fillSelect($('staff'), staff.rows.map((s) => ({ value: s.id, label: s.displayName || s.name })),
    { blank: '（選んでください）', value: $('staff').value });

  const cats = (masters?.categories || []).map((c) => ({ value: c.id, label: c.name }));
  fillSelect($('category'), cats, { blank: '（指定しない）', value: $('category').value });

  const coupons = forStore(masters?.coupons, store?.id);
  fillSelect($('coupon'), coupons.rows.map((c) => ({ value: c.id, label: c.name })),
    { blank: '（案内しない）', value: $('coupon').value });

  fillSelect($('blogCategory'), optionsOf('blog', 'category'), { blank: '（選んでください）', value: $('blogCategory').value });

  // 何がいくつ入っているのかを、その場で見えるようにする
  const notes = [];
  if (!masters?.staff?.length) notes.push('スタッフが登録されていません');
  else if (!staff.narrowed) notes.push(`スタッフは全店ぶん（${staff.rows.length}名）を出しています。設定で店舗を選ぶと、その店のぶんに絞られます`);
  if (!masters?.categories?.length) notes.push('メニューカテゴリが登録されていません（無くても投稿できます）');
  $('makeNote').textContent = notes.join('／');
  $('makeNote').hidden = !notes.length;

  $('blogOnly').hidden = state.postType !== 'blog';
  renderPhotos();
}

// --- 確認画面 ---------------------------------------------------------------

function counter(elId, valueLen, max) {
  const el = $(elId);
  el.textContent = `${valueLen} / ${max}`;
  el.classList.toggle('over', valueLen > max);
}

function renderTags() {
  const box = $('tagBox');
  box.innerHTML = '';
  state.tags.forEach((t, i) => {
    const d = document.createElement('span');
    d.className = 'tag';
    d.textContent = '#' + t;
    const x = document.createElement('button');
    x.type = 'button'; x.textContent = '×';
    x.setAttribute('aria-label', `${t} を外す`);
    x.onclick = () => { state.tags.splice(i, 1); renderTags(); };
    d.appendChild(x);
    box.appendChild(d);
  });
  if (!state.tags.length) box.innerHTML = '<span class="note">（なし）</span>';
}

function renderCheck() {
  const lim = LIMITS[state.postType];
  const r = state.result || {};

  $('title').value = r.title || '';
  $('body').value = r.body || '';
  state.tags = [...(r.tags || [])];
  renderTags();
  counter('cTitle', [...$('title').value].length, lim.title);
  counter('cBody', [...$('body').value].length, lim.body);

  // 別案
  const alt = $('altBox');
  alt.innerHTML = '';
  for (const a of (r.altTitles || [])) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'alt'; b.textContent = '別案: ' + a;
    b.onclick = () => { $('title').value = a; counter('cTitle', [...a].length, lim.title); };
    alt.appendChild(b);
  }

  $('styleOnly').hidden = state.postType !== 'style';
  if (state.postType === 'style') {
    const x = r.extra || {};
    $('menuText').value = x.menuText || '';
    counter('cMenu', [...$('menuText').value].length, 50);
    fillSelect($('gender'), optionsOf('style', 'gender'), { blank: '（未選択）', value: x.gender || '' });
    fillSelect($('length'), optionsOf('style', 'length'), { blank: '（未選択）', value: x.length || '' });
    for (const k of MODEL_FIELDS) {
      fillSelect($(k), optionsOf('style', k), { blank: '（設定しない）', value: x[k] || '' });
    }
    const box = $('menuChecks');
    box.innerHTML = '';
    const chosen = new Set(x.menuChecks || []);
    const list = optionsOf('style', 'menuChecks');
    if (!list.length) box.innerHTML = '<span class="note">（PCで選択肢を読み取ると出ます）</span>';
    for (const name of list) {
      const l = document.createElement('label');
      l.style.cssText = 'display:flex;gap:8px;align-items:center;margin:4px 0;color:var(--ink);font-size:14px';
      const c = document.createElement('input');
      c.type = 'checkbox'; c.value = name; c.checked = chosen.has(name);
      c.style.cssText = 'width:20px;height:20px;flex:0 0 auto';
      l.appendChild(c);
      l.appendChild(document.createTextNode(name));
      box.appendChild(l);
    }
  }
  show('s-check');
}

function collect() {
  const lim = LIMITS[state.postType];
  const title = $('title').value.trim();
  const body = $('body').value.trim();
  if (!title) throw new Error('タイトルを入れてください。');
  if (!body) throw new Error('本文を入れてください。');
  if ([...title].length > lim.title) throw new Error(`タイトルは${lim.title}文字までです。`);
  if ([...body].length > lim.body) throw new Error(`本文は${lim.body}文字までです。`);

  const extra = {};
  if (state.postType === 'style') {
    extra.menuText = $('menuText').value.trim().slice(0, 50);
    extra.gender = $('gender').value;
    extra.length = $('length').value;
    for (const k of MODEL_FIELDS) extra[k] = $(k).value;
    extra.menuChecks = [...$('menuChecks').querySelectorAll('input:checked')].map((c) => c.value);
    if (!extra.gender) throw new Error('カテゴリ（レディース／メンズ）を選んでください。');
    if (!extra.length) throw new Error('長さを選んでください。');
    if (!extra.menuText) throw new Error('メニュー内容を入れてください。');
  } else {
    extra.blogCategory = $('blogCategory').value;
    if (!extra.blogCategory) throw new Error('ブログのカテゴリを選んでください。サロンボード側の必須項目です。');
  }
  return { title, body, extra };
}

// --- 生成 -------------------------------------------------------------------

async function doGenerate() {
  const why = readiness();
  if (why) { say(why, 'err'); return; }
  if (!state.photos.length) { say('写真を1枚以上えらんでください。', 'err'); return; }
  if (state.postType === 'blog' && !$('blogCategory').value) {
    say('ブログのカテゴリを選んでください。サロンボード側の必須項目です。', 'err'); return;
  }

  const btn = $('btnGen');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>つくっています…';
  hush();

  try {
    const data = {
      settings: masters.settings || { ai: {}, tone: {} },
      stores: masters.stores || [],
      staff: masters.staff || [],
      categories: masters.categories || [],
      coupons: masters.coupons || [],
      mappings: masters.mappings || {},
      drafts: [],
    };
    const draft = {
      postType: state.postType,
      storeId: myStore()?.id || '',
      staffId: $('staff').value,
      categoryId: $('category').value,
      couponId: $('coupon').value,
      photos: state.photos,
      note: $('note').value.trim(),
    };
    state.result = await generate({ data, draft, relay: R.makeRelay(sync()) });
    // ブログのカテゴリは人が選んだものを残す
    if (state.postType === 'blog') {
      state.result.extra = { ...(state.result.extra || {}), blogCategory: $('blogCategory').value };
    }
    renderCheck();
  } catch (e) {
    say(String(e.message || e), 'err', true);
  } finally {
    btn.disabled = false;
    btn.textContent = '文章をつくる';
  }
}

// --- 送信 -------------------------------------------------------------------

async function doSend() {
  if (state.sending) return;
  let picked;
  try { picked = collect(); }
  catch (e) { say(String(e.message || e), 'err'); return; }

  const btn = $('btnSend');
  state.sending = true;
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>送っています…';
  hush();

  try {
    // ① 写真を先に預ける
    const ids = [];
    for (let i = 0; i < state.photos.length; i++) {
      btn.innerHTML = `<span class="spin"></span>写真を送っています（${i + 1}/${state.photos.length}）`;
      ids.push(await R.putPhoto(sync(), state.photos[i].dataUrl, `photo${i + 1}.jpg`));
    }

    // ② 順番待ちに並べる
    btn.innerHTML = '<span class="spin"></span>順番待ちに入れています…';
    const store = myStore();
    const staffName = $('staff').selectedOptions[0]?.value ? $('staff').selectedOptions[0].textContent : '';
    const at = $('scheduleAt').value;

    await R.pushQueue(sync(), {
      storeCode: store?.code || '',
      storeName: store?.name || '',
      postType: state.postType,
      staff: staffName,
      category: $('category').selectedOptions[0]?.value ? $('category').selectedOptions[0].textContent : '',
      coupon: $('coupon').selectedOptions[0]?.value ? $('coupon').selectedOptions[0].textContent : '',
      title: picked.title,
      body: picked.body,
      tags: state.tags.map((t) => '#' + t).join(' '),
      scheduleAt: state.postType === 'blog' && at ? new Date(at).toISOString() : '',
      extra: JSON.stringify(picked.extra),
      photos: ids.join(','),
      sender: cfg.sender || '',
    });

    // 送り終えたら、次の投稿にそなえて写真と本文だけ空にする
    state.photos = [];
    state.result = null;
    state.tags = [];
    $('note').value = '';
    $('scheduleAt').value = '';
    renderMake();
    show('s-make');
    say('PCへ送りました。［状況］で進み具合を確認できます。', 'ok');
  } catch (e) {
    say('送れませんでした: ' + (e.message || e) + '\n電波の届くところで、もう一度［PCへ送る］を押してください。内容は残っています。', 'err', true);
  } finally {
    state.sending = false;
    btn.disabled = false;
    btn.textContent = 'PCへ送る';
  }
}

// --- 状況 -------------------------------------------------------------------

const STATUS_NOTE = {
  '待ち': 'PCが受け取るのを待っています',
  '取得済': 'PCが受け取りました。登録の順番待ちです',
  '確認待ち': 'PCで入力まで済みました。人が確定します',
  '投稿済': 'サロンボードに登録されました',
  '失敗': '登録できませんでした。PCの記録を確認してください',
};

async function loadStatus() {
  const box = $('statusList');
  const why = readiness();
  if (why) { box.innerHTML = `<p class="note">${why}</p>`; return; }
  box.innerHTML = '<p class="note">読み込み中…</p>';
  try {
    const rows = await R.listQueue(sync(), myStore()?.code || '', 30);
    if (!rows.length) { box.innerHTML = '<p class="note">まだ送ったものはありません。</p>'; return; }
    box.innerHTML = '';
    for (const r of rows) {
      const d = document.createElement('div');
      d.className = 'item';
      const t = document.createElement('div');
      t.className = 't';
      t.textContent = r.title || '(無題)';
      const m = document.createElement('div');
      m.className = 'm';
      const pill = document.createElement('span');
      pill.className = 'pill ' + (r.status || '待ち');
      pill.textContent = r.status || '待ち';
      m.appendChild(pill);
      const when = r.at ? new Date(r.at) : null;
      m.appendChild(document.createTextNode(
        [(r.postType === 'style' ? 'ヘアスタイル' : 'ブログ'),
         r.sender ? r.sender + 'さん' : '',
         when && !isNaN(when) ? `${when.getMonth() + 1}/${when.getDate()} ${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}` : '',
        ].filter(Boolean).join(' ／ ')));
      d.appendChild(t); d.appendChild(m);
      const note = document.createElement('div');
      note.className = 'm';
      note.textContent = (STATUS_NOTE[r.status] || '') + (r.status === '失敗' && r.result ? `（${r.result}）` : '');
      d.appendChild(note);
      box.appendChild(d);
    }
  } catch (e) {
    box.innerHTML = `<p class="note">読み込めませんでした: ${e.message || e}</p>`;
  }
}

// --- 設定 -------------------------------------------------------------------

function renderSetup() {
  $('appVersion').textContent = `いま動いている画面: v${APP_VERSION}`;
  $('cfgUrl').value = cfg.url || '';
  $('cfgToken').value = cfg.token || '';
  const has = !!masters;
  $('cfgStoreCard').hidden = !has;
  if (has) {
    fillSelect($('cfgStore'), (masters.stores || []).map((s) => ({ value: s.id, label: s.name })),
      { blank: null, value: cfg.storeId });
    $('cfgSender').value = cfg.sender || '';
    const n = (masters.staff || []).length;
    const c = (masters.coupons || []).length;
    const names = (list, key = 'name') => (list || []).slice(0, 6)
      .map((r) => r[key] || r.name || '(名前なし)').join('、') + ((list || []).length > 6 ? ' ほか' : '');
    $('mastersNote').textContent =
      `取り込み済み: 店舗${(masters.stores || []).length}件 / スタッフ${n}件 / `
      + `カテゴリ${(masters.categories || []).length}件 / クーポン${c}件`
      + (masters.updatedAt ? `（PCからの書き出し: ${new Date(masters.updatedAt).toLocaleString('ja-JP')}）` : '')
      + `\n店舗: ${names(masters.stores) || '（なし）'}`
      + `\nスタッフ: ${names(masters.staff, 'displayName') || '（なし）'}`;
    $('mastersNote').style.whiteSpace = 'pre-line';
  }
}

async function doConnect() {
  const url = $('cfgUrl').value.trim();
  const token = $('cfgToken').value.trim();
  if (!url || !token) { say('URLと合言葉の両方を入れてください。', 'err'); return; }
  const btn = $('btnConnect');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>つないでいます…';
  try {
    cfg = { ...cfg, url, token };
    await R.ping(sync());
    await loadMasters();
    save(CFG_KEY, cfg);
    renderSetup(); renderMake();
    say('つながりました。店舗と自分の名前を選んで保存してください。', 'ok');
  } catch (e) {
    say(String(e.message || e), 'err', true);
  } finally {
    btn.disabled = false; btn.textContent = 'つないで読み込む';
  }
}

// --- 起動 -------------------------------------------------------------------

function bind() {
  for (const b of document.querySelectorAll('nav button')) {
    b.onclick = () => {
      show(b.dataset.go);
      if (b.dataset.go === 's-status') loadStatus();
      if (b.dataset.go === 's-setup') renderSetup();
    };
  }

  for (const b of $('typeSeg').querySelectorAll('button')) {
    b.onclick = () => {
      state.postType = b.dataset.type;
      for (const o of $('typeSeg').querySelectorAll('button')) o.classList.toggle('on', o === b);
      // 種別によって使える枚数が変わるので、あふれる分は外す
      state.photos = state.photos.slice(0, LIMITS[state.postType].photos);
      renderMake();
    };
  }

  $('file').onchange = async (e) => {
    const max = LIMITS[state.postType].photos;
    const files = [...e.target.files].slice(0, max - state.photos.length);
    for (const f of files) {
      try { state.photos.push({ dataUrl: await shrink(f), name: f.name }); }
      catch (err) { say(String(err.message || err), 'err'); }
    }
    e.target.value = '';
    renderPhotos();
  };

  $('btnGen').onclick = doGenerate;
  $('btnBack').onclick = () => show('s-make');
  $('btnRegen').onclick = () => { show('s-make'); doGenerate(); };
  $('btnSend').onclick = doSend;
  $('btnRefresh').onclick = loadStatus;
  $('btnConnect').onclick = doConnect;

  $('title').oninput = () => counter('cTitle', [...$('title').value].length, LIMITS[state.postType].title);
  $('body').oninput  = () => counter('cBody',  [...$('body').value].length,  LIMITS[state.postType].body);
  $('menuText').oninput = () => counter('cMenu', [...$('menuText').value].length, 50);

  $('tagAdd').onclick = () => {
    const v = $('tagIn').value.trim().replace(/^#/, '');
    if (v && !state.tags.includes(v)) state.tags.push(v);
    $('tagIn').value = '';
    renderTags();
  };
  $('tagIn').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); $('tagAdd').click(); } };

  $('btnSaveCfg').onclick = () => {
    cfg.storeId = $('cfgStore').value;
    cfg.sender = $('cfgSender').value.trim();
    save(CFG_KEY, cfg);
    renderMake();
    say('保存しました。', 'ok');
  };

  $('btnReload').onclick = async () => {
    try { await loadMasters(); save(CFG_KEY, cfg); renderSetup(); renderMake(); say('取り込み直しました。', 'ok'); }
    catch (e) { say(String(e.message || e), 'err', true); }
  };

  $('btnUpdateApp').onclick = async () => {
    // 手元に残っている古い画面を消してから読み込み直す。
    // 保存してあるURL・合言葉・店舗情報はそのまま残します。
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {}
    const u = new URL(location.href);
    u.searchParams.set('v', String(Date.now()));
    location.replace(u.toString());
  };

  $('btnWipe').onclick = () => {
    if (!confirm('この端末に保存されているURL・合言葉・店舗情報をすべて消します。よろしいですか？')) return;
    localStorage.removeItem(CFG_KEY);
    localStorage.removeItem(MASTERS_KEY);
    cfg = { url: '', token: '', storeId: '', sender: '' };
    masters = null;
    renderSetup(); renderMake();
    say('消しました。', 'ok');
  };
}

function start() {
  bind();
  renderMake();
  renderSetup();
  const why = readiness();
  if (why) { show('s-setup'); say(why, 'info', true); }
  else if (navigator.onLine) {
    // 起動のたびに、店舗やクーポンの変更を静かに取り込み直す
    loadMasters().then(() => { renderSetup(); renderMake(); }).catch(() => {});
  }
}

start();
