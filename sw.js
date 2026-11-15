const CACHE_NAME = 'thanhchi-edu-shell-v71';
const SHELL_ASSETS = ['./', './index.html', './styles.css', './app.js', './manifest.webmanifest', './apple-touch-icon.png'];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_ASSETS)).catch(() => {})
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-First cho các file tĩnh cùng domain (luôn nhận bản mới nhất khi có mạng, dùng cache khi mất mạng)
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isDocRequest = req.mode === 'navigate' || req.destination === 'document';

  event.respondWith(
    fetch(req, { cache: 'no-store' })
      .then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone)).catch(() => {});
          return res;
        }
        return caches.match(req, { ignoreSearch: true }).then(hit => hit || res);
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then(hit => {
          if (hit) return hit;
          return isDocRequest ? caches.match('./index.html', { ignoreSearch: true }) : Response.error();
        })
      )
  );
});
