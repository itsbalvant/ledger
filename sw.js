const CACHE = "ledger-v10";
const SCOPE = self.registration.scope; // works under a GitHub Pages subpath too
const PRECACHE_URLS = [
  "",
  "index.html",
  "css/styles.css",
  "js/main.js",
  "js/auth.js",
  "js/db.js",
  "js/date-utils.js",
  "js/tasks.js",
  "js/reading.js",
  "js/finance.js",
  "js/firebase-config.js",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
].map((p) => new URL(p, SCOPE).toString());

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never intercept Firebase/Google API calls — always go to the network.
  if (url.origin !== self.location.origin) return;

  // Network-first: this app ships frequent fixes, and a cache-first
  // strategy risks silently running stale JS (including auth logic)
  // until some later background refresh catches up. Always prefer a
  // fresh copy when online; only fall back to the cache when offline.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match(new URL("index.html", SCOPE).toString())))
  );
});
