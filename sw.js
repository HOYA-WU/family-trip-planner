// 離線用的 Service Worker：把 App 本身存在手機上，沒網路也能打開。
// 行程資料的離線由 Firestore 自己的快取處理，這裡不碰。
// 每次更新程式碼後，把 VERSION 加 1，家人的手機才會換成新版。
const VERSION = "v16";
const CACHE = "ftp-" + VERSION;
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/app.css",
  "./js/app.js",
  "./js/config.js",
  "./js/utils.js",
  "./js/model.js",
  "./js/store.js",
  "./js/store-demo.js",
  "./js/store-firebase.js",
  "./js/ui.js",
  "./js/files.js",
  "./js/money.js",
  "./js/board.js",
  "./js/today.js",
  "./js/blocks.js",
  "./js/trip.js",
  "./js/settings.js",
  "./js/transfer.js",
  "./js/weather.js",
  "./js/ai.js",
  "./js/blocks/map.js",
  "./js/blocks/todo.js",
  "./js/blocks/flights.js",
  "./js/blocks/tickets.js",
  "./js/blocks/lists.js",
  "./js/blocks/outfits.js",
  "./js/blocks/expenses.js",
  "./js/blocks/misc.js",
  "./js/vendor/preact-htm.js",
  "./js/vendor/sortable.esm.js",
  "./icons/favicon-32.png",
  "./icons/favicon-64.png",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  // cache: "reload"：跳過瀏覽器自己的暫存，確保拿到剛更新的檔案
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("ftp-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // 開頁面：先試網路，沒網路就用存著的版本
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put("./index.html", copy));
        return res;
      }).catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Firebase 程式庫（網址含版本號，不會變）：有存就用存的
  if (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }))
    );
    return;
  }

  // 自己的檔案：先給存著的（快），同時在背景更新
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
  }
});
