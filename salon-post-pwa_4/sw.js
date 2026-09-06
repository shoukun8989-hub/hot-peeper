// 画面の部品だけを手元に置いておくための小さな仕組み。
// 通信そのもの（スプレッドシートへの送信）は必ずその場で行います。
const CACHE = 'salonpost-v1';
const SHELL = [
  './', './index.html', './app.js', './manifest.webmanifest',
  './lib/store.js', './lib/relay.js', './lib/generate.js',
  './icons/icon192.png', './icons/icon512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // 送信はそのまま通す
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // Google への通信は触らない

  // 画面の部品は「まず新しいものを取りに行き、だめなら手元のもの」で出す。
  // こうしておくと、置き換えたときに古い画面が残り続けません。
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
