const CACHE_NAME = 'thanhchi-edu-shell-v72';
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

function fetchWithTimeout(req, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('SW_FETCH_TIMEOUT')), timeoutMs);
    fetch(req, { cache: 'no-store' })
      .then(res => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch(err => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// Network-First có giới hạn thời gian chờ (tránh treo trang khi mạng chập chờn)
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isDocRequest = req.mode === 'navigate' || req.destination === 'document';

  event.respondWith(
    fetchWithTimeout(req, 4000)
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
