const CACHE = "fietsclub-pronostiek-v10";
const ASSETS = [
  "./",
  "index.html",
  "css/style.css",
  "js/app.js",
  "js/logic.js",
  "js/store.js",
  "js/afbeelding.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((sleutels) =>
        Promise.all(sleutels.filter((s) => s !== CACHE).map((s) => caches.delete(s)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches
      .match(e.request, { ignoreSearch: true })
      .then((r) => r ?? fetch(e.request))
  );
});
