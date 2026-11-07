// StormCheck service worker: guarda la app en el dispositivo para que abra sin conexión.
// Solo cachea recursos del mismo origen; las llamadas a la API (otro origen) pasan directo a la red.
const VERSION = "stormcheck-v2";
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// La página manda los archivos que ya cargó antes de que el SW existiera (JS, CSS, fuentes),
// así basta con abrir la app una vez con red para que funcione en modo avión.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "precache" || !Array.isArray(event.data.urls)) return;
  const urls = event.data.urls.filter((u) => {
    try {
      return new URL(u).origin === self.location.origin;
    } catch {
      return false;
    }
  });
  event.waitUntil(caches.open(VERSION).then((c) => Promise.all(urls.map((u) => c.add(u).catch(() => {})))));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Páginas: red primero (siempre la versión más nueva), caché si no hay red.
  // Se guarda por ruta (sin ?code=&state= del login), y si una ruta nunca se visitó se usa la portada.
  if (req.mode === "navigate") {
    const key = url.pathname;
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(key, copy));
          }
          return res;
        })
        .catch(() => caches.match(key).then((hit) => hit || caches.match("/")))
    );
    return;
  }

  // Archivos de build (/_next/static tienen hash) e iconos: caché primero.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
