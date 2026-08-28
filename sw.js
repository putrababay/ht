const CACHE_NAME = "ptt-sibagus-v6";
const APP_SHELL = ["/", "/index.html", "/manifest.json", "/icon-512.png"];

const CDN_ASSETS = [
  "https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js",
  "https://unpkg.com/mqtt@4.3.7/dist/mqtt.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2",
];

const CDN_HOSTS = ["unpkg.com", "cdnjs.cloudflare.com"];

async function cacheUrls(cache, urls) {
  await Promise.allSettled(
    urls.map(async (url) => {
      try {
        await cache.add(url);
      } catch (err) {
        console.warn("[Service Worker] Gagal cache:", url, err);
      }
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cacheUrls(cache, [...APP_SHELL, ...CDN_ASSETS]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          }),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return caches.match("/index.html");
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    networkPromise.catch(() => {});
    return cached;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) return networkResponse;

  if (request.mode === "navigate") {
    return caches.match("/index.html");
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isKnownCdn = CDN_HOSTS.some((host) => url.hostname.includes(host));

  if (!isSameOrigin && !isKnownCdn) return;

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(staleWhileRevalidate(event.request));
});
