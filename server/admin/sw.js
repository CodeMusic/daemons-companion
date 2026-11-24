// C-330: THE ENGINE ROOM's worker -- what lets it install and open from the home screen. Its own files come from the hub
// first and from this cache when the hub cannot be reached; the API is never kept (it is the hub's, and live).
const CACHE = "engine-room-15";   // C-361: CREATIONS; C-363: THE MESH; C-364: SAVES; C-401: the restart band; C-399; C-402; C-413; C-478: IN PLAY
const SHELL = ["./", "admin.css", "admin.js", "manifest.webmanifest", "icon-192.png", "apple-touch-icon.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || !url.pathname.startsWith("/admin/")) return;
  // C-499: from outside, a hub restarting is the proxy's 502/503/504 page, not a failed fetch -- the kept page stands in
  // for it too, so a reload while the hub restarts shows THE ENGINE ROOM and its band (C-401), not the proxy's error
  const kept = () => caches.match(e.request, { ignoreSearch: true }).then((r) => r ?? caches.match("./"));
  e.respondWith(fetch(e.request, { cache: "no-cache" }).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    if (r.status === 502 || r.status === 503 || r.status === 504) return kept().then((k) => k ?? r);
    return r;
  }).catch(kept));
});
