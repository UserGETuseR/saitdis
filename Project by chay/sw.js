// ===== Service Worker «Чайной истории» =====
// Делает приложение устанавливаемым и быстрым.
// Стратегии:
//   • /api/ — service worker не участвует вообще. Персональные данные, сессия
//     и остатки никогда не попадают в Cache Storage.
//   • Навигация (HTML) — network-first (свежие обновления, офлайн-фолбэк).
//   • Свои статики (css/js/svg) — stale-while-revalidate (быстро + тихо обновляется).
//   • Внешние (шрифты Google, иконки CDN) — stale-while-revalidate, чтобы CDN
//     не залипал навсегда на первой закэшированной версии.
// При смене версии меняй CACHE — старые кеши очищаются на activate.

const CACHE = "cha-cache-v42-teahouse";
const ASSET_VERSION = "20260903.1";

// Пути, которые service worker обязан пропускать напрямую в сеть.
const BYPASS = [/^\/api\//];

const CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./img/icon.svg",
  "./img/icon-maskable.svg",
  "./img/icon-192.png",
  "./img/icon-512.png",
  "./img/icon-maskable-192.png",
  "./img/icon-maskable-512.png",
  `./assets/css/styles.css?v=${ASSET_VERSION}`,
  `./assets/css/brand-2026.css?v=${ASSET_VERSION}`,
  `./assets/css/director-2026.css?v=${ASSET_VERSION}`,
  `./assets/css/polish-2026.css?v=${ASSET_VERSION}`,
  "./img/brand/logo-color.png",
  "./img/cold-menu-reference-real.png",
  "./img/matcha-menu-reference-real.png",
  "./img/brand/logo-cream-on-dark.png",
  "./img/brand/logo-mark-color.png",
  "./img/brand/mark-color.png",
  "./img/brand/mark-bowl-terra.svg",
  "./img/brand/mark-bowl-cream.svg",
  "./img/brand/pattern-real-muted.png",
  `./assets/js/config.js?v=${ASSET_VERSION}`,
  `./assets/js/data.teas.js?v=${ASSET_VERSION}`,
  `./assets/js/data.mushrooms.js?v=${ASSET_VERSION}`,
  `./assets/js/data.elixirs.js?v=${ASSET_VERSION}`,
  `./assets/js/data.services.js?v=${ASSET_VERSION}`,
  `./assets/js/data.drinks.js?v=${ASSET_VERSION}`,
  `./assets/js/data.commerce.js?v=${ASSET_VERSION}`,
  `./assets/js/data.events.js?v=${ASSET_VERSION}`,
  `./assets/js/data.practices.js?v=${ASSET_VERSION}`,
  `./assets/js/data.formats.js?v=${ASSET_VERSION}`,
  `./assets/js/data.wisdom.js?v=${ASSET_VERSION}`,
  `./assets/js/brewing.js?v=${ASSET_VERSION}`,
  `./assets/js/db.js?v=${ASSET_VERSION}`,
  `./assets/js/api.js?v=${ASSET_VERSION}`,
  `./assets/js/operations.js?v=${ASSET_VERSION}`,
  `./assets/js/content.js?v=${ASSET_VERSION}`,
  `./assets/js/inventory.js?v=${ASSET_VERSION}`,
  `./assets/js/orders.js?v=${ASSET_VERSION}`,
  `./assets/js/notifications.js?v=${ASSET_VERSION}`,
  `./assets/js/shifts.js?v=${ASSET_VERSION}`,
  `./assets/js/store.js?v=${ASSET_VERSION}`,
  `./assets/js/auth.js?v=${ASSET_VERSION}`,
  `./assets/js/auth.cloud.js?v=${ASSET_VERSION}`,
  `./assets/js/branches.js?v=${ASSET_VERSION}`,
  `./assets/js/ui.js?v=${ASSET_VERSION}`,
  `./assets/js/views.js?v=${ASSET_VERSION}`,
  `./assets/js/views.next.js?v=${ASSET_VERSION}`,
  `./assets/js/views.content.js?v=${ASSET_VERSION}`,
  `./assets/js/views.director.js?v=${ASSET_VERSION}`,
  `./assets/js/commerce.js?v=${ASSET_VERSION}`,
  `./assets/js/app.js?v=${ASSET_VERSION}`,
  "./img/matcha-lineup-v1.png",
  "./img/matcha-lineup-v2.png",
  "./img/mushroom-lineup-v1.png",
  "./img/cold-lineup-v2.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      // Cache.add поддержан не везде, поэтому кладём через fetch + put:
      // так один недоступный ресурс не оставляет precache пустым.
      Promise.allSettled(CORE.map((url) =>
        fetch(new Request(url, { cache: "reload" }))
          .then((res) => (res && res.ok ? c.put(url, res) : null))
      ))
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

  // Никогда не вмешиваемся в работу API: ни чтения, ни записи.
  // Сессия, лояльность, заказы и остатки не должны оставаться на устройстве.
  if (sameOrigin && BYPASS.some((rule) => rule.test(url.pathname))) return;

  // Навигации — network-first
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => { cachePut(req, res.clone()); return res; })
        .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
    );
    return;
  }

  // Свои статики и внешние ресурсы — stale-while-revalidate.
  // Отдаём кэш сразу, но всегда обновляем его в фоне.
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => { cachePut(req, res.clone()); return res; })
        .catch(() => cached);
      if (cached) { network.catch(() => {}); return cached; }
      return network;
    })
  );
});

function cachePut(req, res) {
  if (!res || res.status !== 200 || (res.type !== "basic" && res.type !== "cors")) return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin && BYPASS.some((rule) => rule.test(url.pathname))) return;
  caches.open(CACHE).then((c) => c.put(req, res)).catch(() => {});
}
