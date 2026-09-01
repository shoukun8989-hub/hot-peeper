// ※ このファイルは salonpost/lib/ からの写しです。直すときは元のほうを直してください。
// ---------------------------------------------------------------------------
// 中継ぎ役（Apps Script ウェブアプリ）との会話だけをまとめた層
//
//   ここは Chrome 拡張の機能を一切使いません。
//   PC の拡張機能からも、スマホ用アプリからも、同じこのファイルを読み込みます。
//
//   CORS の事前リクエスト(OPTIONS)に Apps Script が答えられないため、
//   Content-Type は text/plain にして「単純リクエスト」に収めています。
// ---------------------------------------------------------------------------

export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;   // 1枚あたりの上限（送る前に縮めます）

export function checkUrl(url) {
  const u = String(url || '').trim();
  if (!u) throw new Error('同期先のURLが設定されていません。');
  if (!/^https:\/\/script\.google\.com\//.test(u)) {
    throw new Error('ウェブアプリのURLは https://script.google.com/... の形になります。');
  }
  return u;
}

/**
 * 中継ぎ役をひとつ呼ぶ。
 * @param {{url:string, token:string}} sync
 * @param {string} action
 * @param {object} payload
 */
export async function call(sync, action, payload = {}) {
  const url = checkUrl(sync?.url);

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=utf-8' },
      redirect: 'follow',
      body: JSON.stringify({ action, token: sync?.token || '', ...payload }),
    });
  } catch (e) {
    throw new Error('同期先に接続できませんでした。URLと、デプロイの公開範囲をご確認ください。');
  }

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); }
  catch { throw new Error('同期先からの応答を読み取れませんでした。デプロイをやり直すと直ることがあります。'); }

  if (!json.ok) throw new Error(json.error || '同期先でエラーが起きました。');
  return json;
}

export async function ping(sync) {
  const r = await call(sync, 'ping');
  return { sheet: r.sheet || '(名称不明)', version: r.version || 1 };
}

/** 店舗・スタッフ・クーポン・カテゴリ・選択肢の一式（PCが書き出したもの） */
export async function getMasters(sync) {
  const r = await call(sync, 'masters');
  let parsed;
  try { parsed = JSON.parse(r.masters || '{}'); }
  catch { throw new Error('マスタの中身を読み取れませんでした。PCの拡張機能から書き出し直してください。'); }
  return { updatedAt: r.updatedAt || '', ...parsed };
}

// --- 写真 -------------------------------------------------------------------

export function splitDataUrl(dataUrl) {
  const m = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!m) throw new Error('写真の形式を読み取れませんでした。');
  return { mime: m[1], data: m[2] };
}

export async function putPhoto(sync, dataUrl, name = 'photo.jpg') {
  const { mime, data } = splitDataUrl(dataUrl);
  if (data.length * 0.75 > MAX_PHOTO_BYTES) {
    throw new Error('写真が大きすぎます。もう少し小さくしてから送ってください。');
  }
  const r = await call(sync, 'photoPut', { mime, data, name });
  return r.id;
}

export async function getPhoto(sync, id) {
  const r = await call(sync, 'photoGet', { id });
  return `data:${r.mime || 'image/jpeg'};base64,${r.data}`;
}

// --- 順番待ち ---------------------------------------------------------------

export async function pushQueue(sync, post) {
  const r = await call(sync, 'queuePush', { post });
  return r.id;
}

export async function listQueue(sync, storeCode, limit = 30) {
  const r = await call(sync, 'queueList', { storeCode, limit });
  return r.rows || [];
}

export async function takeQueue(sync, storeCode, limit = 5) {
  const r = await call(sync, 'queueTake', { storeCode, limit });
  return r.rows || [];
}

export async function reportQueue(sync, id, status, note = '') {
  return await call(sync, 'queueResult', { id, status, note });
}

// --- AI生成の中継 -----------------------------------------------------------

/**
 * generate() に渡すための関数を作る。
 * APIキーはスクリプト側（Google）にあり、端末には置きません。
 */
export function makeRelay(sync) {
  return async ({ provider, model, maxTokens, system, content }) => {
    const r = await call(sync, 'llm', { provider, model, maxTokens, system, content });
    return r.text || '';
  };
}
