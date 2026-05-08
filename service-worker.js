const CACHE = "soswifi-v1";
const OFFLINE_URL = "/offline.html";

importScripts("https://storage.googleapis.com/workbox-cdn/releases/5.1.2/workbox-sw.js");

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => {
      return cache.addAll([
        "/",
        OFFLINE_URL
      ]);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// ✅ Page navigation (don’t cache API / Stripe pages)
workbox.routing.registerRoute(
  ({ request }) => request.mode === "navigate",
  new workbox.strategies.NetworkFirst({
    cacheName: CACHE,
    networkTimeoutSeconds: 3
  })
);

// ✅ Static assets (css, js, images)
workbox.routing.registerRoute(
  ({ request }) =>
    request.destination === "style" ||
    request.destination === "script" ||
    request.destination === "image",
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: "assets"
  })
);

// ✅ Offline fallback
self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(event.request);
        } catch (err) {
          const cache = await caches.open(CACHE);
          return await cache.match(OFFLINE_URL);
        }
      })()
    );
  }
});
