const CACHE_NAME = "smasra-cache-v4";
const CORE_ASSETS = [
  "index.html",
  "pengumuman.html",
  "profile.html",
  "kehadiran-staf.html",
  "kehadiran-murid.html",
  "event.html",
  "laporan-pentadbir.html",
  "style.css",
  "app.js",
  "kehadiran-murid-borang.js",
  "kehadiran-murid-analisis.js",
  "event.js",
  "laporan-pentadbir.js",
  "manifest.json",
];

// Guna cache.add satu-satu (bukan addAll) supaya SATU fail hilang/404 (contoh fail baharu
// belum sempat di-upload) TAK gagalkan keseluruhan proses install. Kalau addAll dipakai dan
// satu fail gagal, install SW gagal terus & browser cuba install semula pada SETIAP page
// load — proses cuba semula tu fetch semua fail teras di background dan sebabkan SEMUA
// page jadi lambat (bersaing bandwidth dengan permintaan sebenar page).
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(CORE_ASSETS.map((url) => cache.add(url)))
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first, TAPI hanya untuk fail SENDIRI (same-origin: html/css/js/manifest app ni).
// Domain luar (Google Fonts, gambar Google Drive/lh3.googleusercontent.com, API Apps
// Script, cdnjs) dibiarkan terus ke browser tanpa campur tangan SW — elak overhead
// cache.put untuk setiap response luar (banyak antaranya "opaque" & tak boleh dicache
// dengan berkesan lagipun), dan biar browser + CDN uruskan caching mereka sendiri yang
// lagi cekap.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // biar browser uruskan terus

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
