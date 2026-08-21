// ===== Service Worker «Чайной истории» =====
// Делает приложение устанавливаемым и работающим офлайн.
// Стратегии:
//   • Навигация (HTML) — network-first (свежие обновления, офлайн-фолбэк).
//   • Свои статики (css/js/svg) — stale-while-revalidate (быстро + тихо обновляется).
//   • Внешние (шрифты Google, иконки CDN) — cache-first (офлайн после первого визита).
// При смене версии меняй CACHE — старые кеши очищаются на activate.

const CACHE = "cha-cache-v14";

const CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./img/icon.svg",
  "./img/icon-maskable.svg",
  "./assets/css/styles.css?v=12",
  "./assets/css/revamp-2026.css?v=20260821.3",
  "./assets/js/config.js",
  "./assets/js/data.teas.js",
  "./assets/js/data.mushrooms.js",
  "./assets/js/data.elixirs.js",
  "./assets/js/data.services.js",
  "./assets/js/data.drinks.js",
  "./assets/js/data.events.js",
  "./assets/js/data.practices.js",
  "./assets/js/db.js",
  "./assets/js/api.js?v=20260821.1",
  "./assets/js/operations.js",
  "./assets/js/inventory.js",
  "./assets/js/orders.js",
  "./assets/js/shifts.js",
  "./assets/js/store.js",
  "./assets/js/auth.js",
  "./assets/js/auth.cloud.js?v=20260821.1",
  "./assets/js/ui.js",
  "./assets/js/views.js",
  "./assets/js/views.next.js?v=20260821.1",
  "./assets/js/app.js?v=20260821.1",
  "./img/matcha-lineup-v1.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      // не валим установку, если отдельный ресурс не закешировался
      Promise.allSettled(CORE.map((url) => c.add(url)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Навигации — network-first
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => { cachePut(req, res.clone()); return res; })
        .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
    );
    return;
  }

  if (sameOrigin) {
    // свои статики — stale-while-revalidate
    e.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => { cachePut(req, res.clone()); return res; })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // внешние ресурсы (шрифты, CDN-иконки) — cache-first
  e.respondWith(
    caches.match(req).then((cached) =>
      cached || fetch(req).then((res) => { cachePut(req, res.clone()); return res; }).catch(() => cached)
    )
  );
});

function cachePut(req, res) {
  if (!res || res.status !== 200 || (res.type !== "basic" && res.type !== "cors")) return;
  caches.open(CACHE).then((c) => c.put(req, res)).catch(() => {});
}
