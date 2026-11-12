/* Service worker ringkas supaya app boleh dipasang (install) di tablet/telefon.
   Strategi: rangkaian dahulu, simpanan (cache) sebagai sandaran jika tiada internet. Panggilan Apps Script / Google Sheets TIDAK disimpan. */
const CACHE = "koop-pos-v1";
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== self.location.origin) return; // hanya fail app sendiri
  e.respondWith(fetch(r).then((res) => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then((x) => x.put(r, c)); } return res; }).catch(() => caches.match(r).then((m) => m || caches.match("./index.html"))));
});
