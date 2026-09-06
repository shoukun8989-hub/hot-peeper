// ※ このファイルは salonpost/lib/ からの写しです。直すときは元のほうを直してください。
// ---------------------------------------------------------------------------
// 生成エンジン : 写真＋設定から タイトル / 本文 / タグ / クーポン案 を組み立てる
// ---------------------------------------------------------------------------
import { byId, FIELD_DEFS, optionsFor } from './store.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const OPENAI_URL    = 'https://api.openai.com/v1/chat/completions';

export const PROVIDERS = {
  anthropic: { label: 'Anthropic（Claude）', keyField: 'apiKey',       modelField: 'model',       keyHint: 'sk-ant-...' },
  openai:    { label: 'OpenAI（ChatGPT）',   keyField: 'openaiApiKey', modelField: 'openaiModel', keyHint: 'sk-...' },
};

const SYSTEM = `あなたは日本の美容サロンのスタッフとして、ホットペッパービューティーに載せる投稿の下書きを書きます。

守ること:
- 実際にその施術を担当したスタッフが書いた文章にする。広告コピーにしない。
- 写真から読み取れる事実だけを書く。写っていない施術内容を推測で足さない。
- 与えられた「文体サンプル」の語り口・一人称・文末・改行の癖に寄せる。サンプルがない場合だけ、落ち着いた敬体で書く。
- 誇大表現と断定を避ける。禁止語は使わない。
- 効果や仕上がりを保証しない。
- 絵文字は、文体サンプルで使われている場合のみ同程度に使う。
- ハッシュタグは検索されうる語にする。関係のない人気タグを混ぜない。

出力は必ず指示されたJSONのみ。前後に説明文を付けない。文字数の上限は必ず守る。`;

// 投稿種別ごとの出力仕様
function schemaFor(postType, opt) {
  if (postType === 'style') {
    const list = (a) => (a && a.length ? a.join(' / ') : '(候補なし。空文字にする)');
    return `# 出力するJSON
{
  "styleName": "スタイル名。30文字以内。検索されうる言葉を含める",
  "comment": "スタイリストコメント。**120文字以内**。担当者が書いた一言として、仕上がりと似合う人を具体的に",
  "menuText": "メニュー内容。50文字以内。実際に行った施術を簡潔に",
  "tags": ["ハッシュタグ", "..."],
  "gender": "次から1つ: ${list(opt.gender)}",
  "length": "写真から判断して次から1つ: ${list(opt.length)}",
  "menuChecks": ["当てはまるものだけ。無ければ空配列: ${list(opt.menuChecks)}"],
  "hairVolume": "写真から判断。分からなければ「設定しない」: ${list(opt.hairVolume)}",
  "hairQuality": "同上: ${list(opt.hairQuality)}",
  "thickness": "同上: ${list(opt.thickness)}",
  "curl": "同上: ${list(opt.curl)}",
  "age": "同上: ${list(opt.age)}",
  "faceShape": "同上: ${list(opt.faceShape)}",
  "altTitles": ["スタイル名の別案", "..."]
}

# 注意
- comment は120文字を超えてはいけません。長くなったら削ってください。
- ブログのような長文にしないでください。1〜3文です。
- 写真から読み取れないモデル情報は、無理に決めず「設定しない」にしてください。
- menuChecks は、写真と指示から確実に言えるものだけにしてください。`;
  }

  if (postType === 'blog') {
    return `# 出力するJSON
{
  "title": "タイトル。**全角25文字以内**。検索されうる言葉を前に置く",
  "body": "本文。全角1000文字以内。改行は80回まで",
  "tags": ["ハッシュタグ", "..."],
  "couponReason": "",
  "altTitles": ["タイトルの別案", "..."]
}

# 注意
- title は25文字を超えてはいけません。長くなったら削ってください。
- ハッシュタグ欄がないので、本文の末尾にこちらで付けます。本文中には書かないでください。`;
  }

  return `# 出力するJSON
{"title":"タイトル。25文字以内","body":"本文","tags":["ハッシュタグ","..."],"couponReason":"","altTitles":["別案","..."]}`;
}

function buildPrompt(ctx) {
  const { store, staffMember, category, coupon, postType, tone, recentTitles, note, bodyLength, forbidden } = ctx;
  const lines = [];

  lines.push(`# 投稿の種別\n${postType}`);

  lines.push(`# 店舗\n店名: ${store?.name || '(未設定)'}\nエリア: ${store?.area || '(未設定)'}`);
  if (store?.toneNote) lines.push(`店舗の文体メモ: ${store.toneNote}`);

  if (staffMember) {
    lines.push(`# 担当スタッフ\n名前: ${staffMember.displayName || staffMember.name}` +
      (staffMember.role ? `\n役職: ${staffMember.role}` : '') +
      (staffMember.specialties ? `\n得意: ${staffMember.specialties}` : ''));
  }

  if (category) {
    lines.push(`# メニューカテゴリ\n名称: ${category.name}` +
      (category.appeal ? `\n訴求したい点: ${category.appeal}` : '') +
      (category.tags?.length ? `\n使ってほしいハッシュタグ候補(最大20個から選ぶ): ${category.tags.join(' / ')}` : ''));
    if (category.sampleBody) lines.push(`# このカテゴリの参考本文\n${category.sampleBody}`);
  }

  if (coupon) {
    lines.push(`# 案内するクーポン\n${coupon.name}` +
      (coupon.price ? ` / ${coupon.price}` : '') +
      (coupon.condition ? ` / ${coupon.condition}` : '') +
      `\n本文の終盤で、押し付けずに一度だけ触れてください。`);
  }

  if (tone?.note) lines.push(`# 全店共通の文体メモ\n${tone.note}`);

  if (tone?.samples?.length) {
    lines.push(`# 文体サンプル(自店の過去投稿)\n` +
      tone.samples.slice(0, 12).map((s, i) => `--- サンプル${i + 1} ---\n${s}`).join('\n'));
  }

  if (recentTitles?.length) {
    lines.push(`# 直近で出したタイトル(書き出しと構成が被らないようにする)\n- ` + recentTitles.slice(0, 15).join('\n- '));
  }

  if (note) lines.push(`# 今回の指示\n${note}`);

  if (ctx.type === 'style') {
    lines.push('# 分量\nハッシュタグは最大20個。文字数はJSONの指定に従ってください。');
  } else {
    lines.push(`# 分量\n本文は${bodyLength || '250〜400文字'}。タイトルは全角25文字以内。ハッシュタグは最大20個。`);
  }
  if (forbidden) lines.push(`# 禁止語\n${forbidden}`);
  lines.push(ctx.schema);

  return lines.join('\n\n');
}

function extractJson(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('生成結果をJSONとして読み取れませんでした。');
  return JSON.parse(raw.slice(start, end + 1));
}

// --- プロバイダごとの呼び出し ---------------------------------------------

function friendlyError(status, provider, model, detail) {
  if (status === 401 || status === 403) return `APIキーが受け付けられませんでした（${PROVIDERS[provider].label}）。設定画面で確認してください。`;
  if (status === 404) return `モデル名「${model}」が見つかりません。設定画面で変更してください。`;
  if (status === 429) return 'APIの利用制限に達しました。少し待ってからやり直してください。';
  if (status === 400 && /model/i.test(detail)) return `モデル名「${model}」をこのキーでは使えないようです。設定画面で変更してください。`;
  return `生成に失敗しました (${status}) ${detail.slice(0, 200)}`;
}

/**
 * APIキーの掃除と点検。
 *
 * キーは通信の見出し（ヘッダー）に載せます。
 * ヘッダーには半角の文字しか入れられないため、日本語や全角文字が1つでも混ざっていると
 * ブラウザが「String contains non ISO-8859-1 code point」という分かりにくい形で止まります。
 * ここで先に見つけて、日本語で伝えます。
 */
export function cleanApiKey(raw) {
  return String(raw || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')   // 目に見えない文字（コピペで混入する）
    .trim();
}

export function apiKeyProblem(key) {
  if (!key) return '未入力です';
  const bad = key.match(/[^\x21-\x7E]/);
  if (bad) {
    const c = bad[0];
    const what = c === ' ' || c === '\u3000' ? '空白' : `「${c}」`;
    return `${what} が混ざっています。APIキーは半角の英数字と記号だけです。前後の説明文や改行ごと貼り付けていないか、`
         + '全角で入力していないかをご確認ください';
  }
  return '';
}

async function callProvider({ ai, content, relay }) {
  const provider = ai.provider === 'openai' ? 'openai' : 'anthropic';
  const def = PROVIDERS[provider];
  const model = String(ai[def.modelField] || '').trim();
  const maxTokens = Number(ai.maxTokens) || 1600;

  if (!model)  throw new Error(`設定画面で ${def.label} のモデル名を登録してください。`);

  // スマホ用アプリは、APIキーを端末に置かずに中継ぎ役ごしに呼びます。
  // relay は「文章を返す関数」で、渡されたときだけそちらを使います。
  if (typeof relay === 'function') {
    const text = await relay({ provider, model, maxTokens, system: SYSTEM, content });
    return extractJson(String(text || ''));
  }

  const apiKey = cleanApiKey(ai[def.keyField]);
  if (!apiKey) throw new Error(`設定画面で ${def.label} のAPIキーを登録してください。`);
  const problem = apiKeyProblem(apiKey);
  if (problem) throw new Error(`${def.label} のAPIキーに ${problem}。設定画面で貼り直してください。`);

  return provider === 'openai'
    ? callOpenAI({ apiKey, model, maxTokens, content })
    : callAnthropic({ apiKey, model, maxTokens, content });
}

async function callAnthropic({ apiKey, model, maxTokens, content }) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model, max_tokens: maxTokens, system: SYSTEM,
      messages: [{ role: 'user', content }],
    }),
  });
  if (!res.ok) throw new Error(friendlyError(res.status, 'anthropic', model, await res.text().catch(() => '')));
  const json = await res.json();
  const text = (json.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  return extractJson(text);
}

async function callOpenAI({ apiKey, model, maxTokens, content }) {
  // Anthropic 形式の content を OpenAI 形式に組み替える
  const parts = content.map((c) => (
    c.type === 'image'
      ? { type: 'image_url', image_url: { url: `data:${c.source.media_type};base64,${c.source.data}` } }
      : { type: 'text', text: c.text }
  ));

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: parts },
      ],
    }),
  });
  if (!res.ok) throw new Error(friendlyError(res.status, 'openai', model, await res.text().catch(() => '')));
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content || '';
  return extractJson(text);
}

/**
 * @param {object} p
 * @param {object} p.data     getAll() の結果
 * @param {object} p.draft    {postType, storeId, staffId, categoryId, couponId, photo:{dataUrl}, note}
 * @param {function} [p.relay] 省略可。APIキーを持たない端末（スマホ）が中継ぎ役に投げるための関数
 */
export async function generate({ data, draft, relay }) {
  const { settings, stores, staff, categories, coupons, drafts } = data;

  const category = byId(categories, draft.categoryId);
  const defs = FIELD_DEFS[draft.postType] || [];
  const mapping = data.mappings?.[draft.postType];
  const opt = {};
  for (const d of defs) {
    const list = optionsFor(mapping, d);
    if (list) opt[d.key] = list.filter((v) => v && v !== '—');
  }

  const ctx = {
    type: draft.postType,
    schema: schemaFor(draft.postType, opt),
    postType: ({ blog: 'ブログ', style: 'ヘアスタイル', photo: 'フォトギャラリー' })[draft.postType] || draft.postType,
    store: byId(stores, draft.storeId),
    staffMember: byId(staff, draft.staffId),
    category,
    coupon: byId(coupons, draft.couponId),
    tone: settings.tone,
    bodyLength: settings.ai.bodyLength,
    forbidden: settings.ai.forbidden,
    note: draft.note,
    recentTitles: drafts
      .filter((d) => d.status === 'posted' && d.storeId === draft.storeId)
      .slice(0, 15).map((d) => d.title).filter(Boolean),
  };

  const content = [];
  const photos = (draft.photos?.length ? draft.photos : (draft.photo ? [draft.photo] : [])).slice(0, 3);
  for (const p of photos) {
    const m = p?.dataUrl?.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (m) content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
  }
  if (photos.length > 1) {
    content.push({ type: 'text', text: `# 写真\n${photos.length}枚あります。同じ施術を別の角度から撮ったものとして扱ってください。` });
  }
  content.push({ type: 'text', text: buildPrompt(ctx) });

  const out = await callProvider({ ai: settings.ai, content, relay });

  const allowed = category?.tags?.length ? category.tags : null;
  let tags = Array.isArray(out.tags) ? out.tags.map((t) => String(t).replace(/^#/, '').trim()).filter(Boolean) : [];
  if (allowed) {
    // カテゴリに登録済みのタグを優先し、足りない分だけ生成分から補う
    const registered = allowed.filter((t) => tags.some((g) => g === t));
    const extra = tags.filter((t) => !allowed.includes(t));
    tags = [...new Set([...registered, ...allowed, ...extra])];
  }

  const altTitles = Array.isArray(out.altTitles) ? out.altTitles.slice(0, 3) : [];

  if (draft.postType === 'style') {
    const pick = (key) => {
      const v = String(out[key] || '').trim();
      const list = opt[key];
      if (!list || !v) return v;
      return list.find((o) => o === v) || list.find((o) => o.includes(v) || v.includes(o)) || '';
    };
    return {
      title: String(out.styleName || '').trim().slice(0, 30),
      body:  String(out.comment  || '').trim().slice(0, 120),
      tags: tags.slice(0, 20),
      altTitles,
      extra: {
        menuText: String(out.menuText || '').trim().slice(0, 50),
        menuChecks: (Array.isArray(out.menuChecks) ? out.menuChecks : [])
          .map((v) => String(v).trim())
          .filter((v) => !opt.menuChecks || opt.menuChecks.includes(v)),
        gender: pick('gender'), length: pick('length'),
        hairVolume: pick('hairVolume'), hairQuality: pick('hairQuality'),
        thickness: pick('thickness'), curl: pick('curl'),
        age: pick('age'), faceShape: pick('faceShape'),
        feature: '',
      },
    };
  }

  return {
    title: String(out.title || '').trim().slice(0, draft.postType === 'blog' ? 25 : 30),
    body: String(out.body || '').trim(),
    tags: tags.slice(0, 20),
    altTitles,
    extra: {},
    couponReason: out.couponReason || '',
  };
}
