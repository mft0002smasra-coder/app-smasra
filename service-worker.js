const CACHE_NAME = "smasra-cache-v2";
const CORE_ASSETS = [
  "index.html",
  "pengumuman.html",
  "profile.html",
  "kehadiran-staf.html",
  "kehadiran-murid.html",
  "event.html",
  "laporan-pentadbir.html",
  "tempahan-bilik.html",
  "tempahan-kaunseling.html",
  "style.css",
  "app.js",
  "kehadiran-murid-borang.js",
  "kehadiran-murid-analisis.js",
  "event.js",
  "laporan-pentadbir.js",
  "erks-database.js",
  "tempahan-kaunseling.js",
  "manifest.json",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first: sentiasa cuba ambil versi TERBARU dari server dahulu.
// Cache cuma dipakai bila tiada internet (fallback), bukan sumber utama.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
