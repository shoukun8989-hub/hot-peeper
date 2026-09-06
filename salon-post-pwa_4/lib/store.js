// ※ このファイルは salonpost/lib/ からの写しです。直すときは元のほうを直してください。
// ---------------------------------------------------------------------------
// データ層 : chrome.storage.local の読み書きをここに集約する
// ---------------------------------------------------------------------------

export const POST_TYPES = {
  blog:  { label: 'ブログ',           kinds: ['hair', 'eyelash', 'nail', 'esthe'] },
  style: { label: 'ヘアスタイル',      kinds: ['hair'] },
  photo: { label: 'フォトギャラリー',  kinds: ['eyelash', 'nail', 'esthe'] },
};

export const KINDS = {
  hair:    'ヘア',
  eyelash: 'アイラッシュ',
  nail:    'ネイル',
  esthe:   'エステ',
};

// 投稿種別ごとに「サロンボードのどの入力欄に入れるか」を覚える項目。
// selector は初回設定のピッカーで学習させる。
//   type: text     … 文字を入れる（textarea も同じ）
//         select   … プルダウン。表示文字で選ぶ
//         radio    … ラジオ。行やセルを教えると、その中から表示文字で選ぶ
//         checkbox … チェック。行やセルを教えると、該当するものを入れる
//         button   … 押す
//         repeat   … 入力して追加ボタンを押すのを繰り返す（ハッシュタグ）
//         container… 枠だけ教える（中身を読む・探すために使う）
//         modalPick… 別画面を開いて一覧から選び、確定ボタンを押す（クーポン）
//         upload   … 別画面を開いてファイルを流し込み、確定ボタンを押す（画像）
export const FIELD_DEFS = {
  // サロンボードの「ブログ編集 入力」にあわせた構成
  blog: [
    { key: 'poster',   label: '投稿者',   type: 'select', required: true },
    { key: 'category', label: 'カテゴリ', type: 'select' },
    { key: 'title',    label: 'タイトル', type: 'text', required: true, max: 25 },
    { key: 'body',     label: '本文',     type: 'text', required: true, max: 1000 },
    { key: 'couponOpen',    label: 'クーポン選択ボタン', type: 'button' },
    { key: 'couponList',    label: 'クーポン一覧の枠',   type: 'container',
      hint: '「クーポン選択」を押して一覧を出した状態で、一覧全体の枠を教えてください' },
    { key: 'couponConfirm', label: 'クーポンの「設定する」ボタン', type: 'button' },
    { key: 'coupon',        label: 'クーポン', type: 'modalPick', virtual: true,
      hint: '上の3つを教えると使えるようになります' },
    { key: 'scheduleMode', label: '予約投稿（設定しない／設定する）', type: 'radio',
      hint: 'ラジオが2つ並んでいる行を教えてください', fallback: ['設定しない', '設定する'] },
    { key: 'scheduleDate', label: '予約投稿の日付', type: 'select' },
    { key: 'scheduleTime', label: '予約投稿の時刻', type: 'select' },
    { key: 'imagePreOpen', label: '画像アップロードの前に押すところ', type: 'button',
      hint: 'アップロード画面を出すのに、先にもう1か所押す必要がある場合だけ教えてください。無ければ空のままで構いません' },
    { key: 'imageOpen',    label: '「画像アップロード」ボタン', type: 'button' },
    { key: 'imageArea',    label: '画像アップロード画面の枠',   type: 'container',
      hint: '「画像アップロード」を押して開いた画面の枠を教えてください。中のファイル入力は自動で探します' },
    { key: 'imageConfirm', label: '画像の確定ボタン', type: 'button', hint: 'あれば。無ければ空のままで構いません' },
    { key: 'images',       label: '画像（最大4枚）', type: 'upload', virtual: true,
      hint: '上の3つを教えると使えるようになります' },
    { key: 'submit',   label: '「確認する」ボタン', type: 'button', required: true },
    { key: 'confirm',  label: '確認画面の投稿ボタン', type: 'button',
      hint: '確認画面には「登録・反映する」と「登録・未反映にする」があります。'
          + 'すぐ掲載するなら前者、下書きとして置くなら後者を教えてください' },
  ],

  // サロンボードの「スタイル掲載情報編集」にあわせた構成
  style: [
    { key: 'stylist',    label: 'スタイリスト名',  type: 'select', required: true },
    { key: 'comment',    label: 'コメント',        type: 'text',   required: true, max: 120 },
    { key: 'styleName',  label: 'スタイル名',      type: 'text',   required: true, max: 30 },
    { key: 'gender',     label: 'カテゴリ',        type: 'radio',  required: true,
      hint: 'レディース／メンズ の行を教えてください', fallback: ['レディース', 'メンズ'] },
    { key: 'length',     label: '長さ',            type: 'select', required: true },
    { key: 'menuChecks', label: 'メニュー内容（チェック）', type: 'checkbox',
      hint: 'パーマ〜ブリーチ のチェックが並ぶ行を教えてください',
      fallback: ['パーマ', 'ストレートパーマ・縮毛矯正', 'エクステ', 'ブリーチ'] },
    { key: 'menuText',   label: 'メニュー内容（記入欄）', type: 'text', required: true, max: 50 },
    { key: 'couponOpen',    label: 'クーポン選択ボタン', type: 'button' },
    { key: 'couponList',    label: 'クーポン一覧の枠',   type: 'container',
      hint: '「クーポン選択」を押して一覧を出した状態で、一覧全体の枠を教えてください' },
    { key: 'couponConfirm', label: 'クーポンの「設定する」ボタン', type: 'button' },
    { key: 'coupon',        label: 'クーポン', type: 'modalPick', virtual: true,
      hint: '上の3つを教えると使えるようになります' },
    { key: 'hashtag',    label: 'ハッシュタグ入力欄', type: 'repeat',
      hint: '入力欄を教えたあと、「ハッシュタグを追加」ボタンも教えてください' },
    { key: 'hashtagAdd', label: 'ハッシュタグの追加ボタン', type: 'button' },
    { key: 'hairVolume', label: '髪量', type: 'radio', fallback: ['設定しない', '少ない', '普通', '多い'] },
    { key: 'hairQuality',label: '髪質', type: 'radio', fallback: ['設定しない', '柔かい', '普通', '硬い'] },
    { key: 'thickness',  label: '太さ', type: 'radio', fallback: ['設定しない', '細い', '普通', '太い'] },
    { key: 'curl',       label: 'クセ', type: 'radio', fallback: ['設定しない', 'なし', '少し', '強い'] },
    { key: 'age',        label: '年代', type: 'radio',
      fallback: ['設定しない', 'キッズ', '10代', '20代', '30代', '40代', '50代', '60代以上'] },
    { key: 'faceShape',  label: '顔型', type: 'radio',
      fallback: ['設定しない', '逆三角', '丸型', 'ベース', '卵型', '面長', '四角'] },
    { key: 'feature',    label: 'ヘアスタイル特集', type: 'select' },
    { key: 'imagePos1',     label: '画像1の位置プルダウン（FRONT）', type: 'select' },
    { key: 'imagePreOpen1', label: '画像1の、アップロードの前に押すところ', type: 'button',
      hint: 'FRONTのアップロード画面を出すのに、写真の枠を押す前にもう1か所押す必要がある場合だけ。'
          + '無ければ空のままで構いません' },
    { key: 'imageOpen1',    label: '画像1の「画像をアップロードする」', type: 'button' },
    { key: 'imageConfirm1', label: '画像1の「登録する」', type: 'button',
      hint: 'スロットごとに登録ボタンがある場合。開いた画面の中にある場合は空のままで構いません' },
    { key: 'imagePos2',     label: '画像2の位置プルダウン（SIDE）',  type: 'select' },
    { key: 'imagePreOpen2', label: '画像2の、アップロードの前に押すところ', type: 'button',
      hint: 'SIDEのぶん。1枚目と同じ場所なら、画像1のほうだけ教えれば3枚とも使われます' },
    { key: 'imageOpen2',    label: '画像2の「画像をアップロードする」', type: 'button' },
    { key: 'imageConfirm2', label: '画像2の「登録する」', type: 'button' },
    { key: 'imagePos3',     label: '画像3の位置プルダウン（BACK）',  type: 'select' },
    { key: 'imagePreOpen3', label: '画像3の、アップロードの前に押すところ', type: 'button',
      hint: 'BACKのぶん' },
    { key: 'imageOpen3',    label: '画像3の「画像をアップロードする」', type: 'button' },
    { key: 'imageConfirm3', label: '画像3の「登録する」', type: 'button' },
    { key: 'imageArea',    label: '画像アップロード画面の枠', type: 'container',
      hint: 'アップロードを押して開いた画面の枠を教えてください。開くたびに別の枠が出る作りにも対応しています' },
    { key: 'imageConfirm', label: '画像の確定ボタン（共通）', type: 'button', hint: 'あれば。無ければ空のままで構いません' },
    { key: 'images',       label: '画像（最大3枚）', type: 'upload', virtual: true,
      hint: '上の枠と各スロットを教えると使えるようになります' },
    { key: 'submit',     label: '登録ボタン', type: 'button', required: true },
  ],

  // ※ フォトギャラリーは実画面を未確認です。ブログに近い構成で仮置きしています。
  photo: [
    { key: 'title',    label: 'タイトル',       type: 'text',   required: true },
    { key: 'body',     label: 'コメント',       type: 'text',   required: true },
    { key: 'category', label: 'カテゴリ',       type: 'select' },
    { key: 'staff',    label: '担当スタッフ',   type: 'select' },
    { key: 'photo',    label: '画像',           type: 'file'   },
    { key: 'submit',   label: '登録ボタン',     type: 'button', required: true },
    { key: 'confirm',  label: '確認画面の確定ボタン', type: 'button' },
  ],
};

// スタイル投稿で自動入力しないもの（画面の作りが特殊なため、人が操作します）
export const MANUAL_STEPS = {
  blog: [],
  style: ['スタイル登録形式（画像／動画）'],
  photo: ['画像（実画面を未確認のため）'],
};

// スタイルの画像スロットに入れる位置の既定値
export const IMAGE_POSITIONS = ['FRONT', 'SIDE', 'BACK'];

export const DEFAULTS = {
  settings: {
    ai: {
      provider: 'anthropic',   // 'anthropic' | 'openai'
      apiKey: '',              // Anthropic のキー
      // モデル名は変わることがあるので設定から差し替えられるようにしている
      model: 'claude-sonnet-4-5',
      openaiApiKey: '',
      openaiModel: 'gpt-4o',
      maxTokens: 1600,
      bodyLength: '250〜400文字',
      forbidden: '絶対、必ず、100%、最安、日本一、完全に治る',
    },
    auto: {
      enabled: false,       // 自動登録は既定でオフ
      autoSubmit: false,    // 登録ボタンまで押すか
      dailyLimit: 5,
      minIntervalSec: 45,
      maxIntervalSec: 120,
      windowStart: '10:00',
      windowEnd: '20:00',
      stopOnFailures: 2,
    },
    tone: {
      samples: [],          // 自店の過去投稿（文体サンプル）
      note: '',             // 店舗共通の文体メモ
    },
    sync: {
      url: '',              // Apps Script のウェブアプリURL
      token: '',            // スクリプト側と揃える合言葉
      autoPush: true,       // 投稿したら自動で書き出す
      keepPostedDays: 30,   // 投稿済みを端末に残す日数（写真は投稿後すぐ捨てる）
      lastPushAt: 0,
      lastPullAt: 0,
      lastError: '',
      // --- スマホ（PWA）からの受け取り ---
      pullQueue: false,     // スマホから届いた投稿を自動で取りに行くか
      queueEveryMin: 10,    // 何分おきに見に行くか
      queueAutoRun: false,  // 受け取ったらそのまま登録まで走らせるか
      lastQueueAt: 0,
      queueError: '',
    },
  },
  stores: [],
  staff: [],
  coupons: [],
  categories: [],
  mappings: {},   // { blog: { url, fields: { title: {selector, note} } } }
  drafts: [],
  bank: [],
  logs: [],
  runstate: { running: false, stoppedReason: '', postedToday: 0, day: '', failures: 0 },
};

const KEYS = Object.keys(DEFAULTS);

export async function getAll() {
  const got = await chrome.storage.local.get(KEYS);
  const out = {};
  for (const k of KEYS) out[k] = got[k] ?? structuredClone(DEFAULTS[k]);
  // settings は入れ子なので既定値とマージする
  out.settings = {
    ai:   { ...DEFAULTS.settings.ai,   ...(out.settings.ai   || {}) },
    auto: { ...DEFAULTS.settings.auto, ...(out.settings.auto || {}) },
    tone: { ...DEFAULTS.settings.tone, ...(out.settings.tone || {}) },
    sync: { ...DEFAULTS.settings.sync, ...(out.settings.sync || {}) },
  };
  return out;
}

export async function get(key) {
  const all = await chrome.storage.local.get(key);
  return all[key] ?? structuredClone(DEFAULTS[key]);
}

export async function set(key, value) {
  await chrome.storage.local.set({ [key]: value });
  return value;
}

export async function patchSettings(section, patch) {
  const settings = await get('settings');
  const merged = {
    ...DEFAULTS.settings, ...settings,
    [section]: { ...DEFAULTS.settings[section], ...(settings[section] || {}), ...patch },
  };
  await set('settings', merged);
  return merged;
}

// --- 一覧系の共通操作 ------------------------------------------------------

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export async function upsert(key, row) {
  const list = await get(key);
  const i = list.findIndex((r) => r.id === row.id);
  if (i >= 0) list[i] = { ...list[i], ...row };
  else list.unshift({ ...row, id: row.id || uid() });
  await set(key, list);
  return list;
}

export async function remove(key, id) {
  const list = (await get(key)).filter((r) => r.id !== id);
  await set(key, list);
  return list;
}

// --- ログ ------------------------------------------------------------------

export async function log(level, msg, extra = {}) {
  const logs = await get('logs');
  logs.unshift({ ts: Date.now(), level, msg, ...extra });
  await set('logs', logs.slice(0, 500));
}

// --- 参照ヘルパ ------------------------------------------------------------

export function byId(list, id) {
  return list.find((r) => r.id === id) || null;
}

export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function withinWindow(auto, d = new Date()) {
  const now = d.getHours() * 60 + d.getMinutes();
  const [sh, sm] = (auto.windowStart || '00:00').split(':').map(Number);
  const [eh, em] = (auto.windowEnd   || '23:59').split(':').map(Number);
  return now >= sh * 60 + sm && now <= eh * 60 + em;
}

// --- 下書きから「どの項目に何を入れるか」を組み立てる -----------------------
// 画面ごとの事情はここに閉じ込める。content.js は値を入れるだけにする。

export function optionsFor(mapping, def) {
  return mapping?.fields?.[def.key]?.options || def.fallback || null;
}

export function buildValues(postType, draft, data) {
  const staffMember = byId(data.staff, draft.staffId);
  const staffName = staffMember ? (staffMember.displayName || staffMember.name) : '';
  const categoryName = byId(data.categories, draft.categoryId)?.name || '';
  const couponName = byId(data.coupons, draft.couponId)?.name || '';
  const tags = (draft.tags || []).map((t) => String(t).replace(/^#/, '')).filter(Boolean);
  const x = draft.extra || {};

  if (postType === 'style') {
    return {
      stylist: staffName,
      comment: (draft.body || '').slice(0, 120),
      styleName: (draft.title || '').slice(0, 30),
      gender: x.gender || '',
      length: x.length || '',
      menuChecks: Array.isArray(x.menuChecks) ? x.menuChecks : [],
      menuText: (x.menuText || '').slice(0, 50),
      coupon: couponName,
      hashtag: tags.slice(0, 20),
      hairVolume: x.hairVolume || '',
      hairQuality: x.hairQuality || '',
      thickness: x.thickness || '',
      curl: x.curl || '',
      age: x.age || '',
      faceShape: x.faceShape || '',
      feature: x.feature || '',
    };
  }

  // ブログとフォトギャラリーは、ハッシュタグ欄がないので本文の末尾に付ける
  const body = (draft.body || '') + (tags.length ? '\n\n' + tags.map((t) => '#' + t).join(' ') : '');

  if (postType === 'blog') {
    const at = x.scheduleAt ? new Date(x.scheduleAt) : null;
    const cat = byId(data.categories, draft.categoryId);
    return {
      poster: staffName,
      // ブログのカテゴリはサロンボード独自の分類（おすすめスタイル など）で、
      // 設定のメニューカテゴリ（髪質改善 など）とは別物です
      category: x.blogCategory || cat?.blogCategory || '',
      title: (draft.title || '').slice(0, 25),
      body: body.slice(0, 1000),
      coupon: couponName,
      scheduleMode: at ? '設定する' : '設定しない',
      scheduleDate: at ? jpDate(at) : '',
      scheduleTime: at ? hhmm(at) : '',
    };
  }

  return {
    title: draft.title || '',
    body,
    category: categoryName,
    staff: staffName,
    coupon: couponName,
  };
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// サロンボードの日付プルダウンの表記に合わせる（例: 2026年08月29日（土））
export function jpDate(d) {
  return `${d.getFullYear()}年${String(d.getMonth() + 1).padStart(2, '0')}月`
       + `${String(d.getDate()).padStart(2, '0')}日（${WEEKDAYS[d.getDay()]}）`;
}

export function hhmm(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
