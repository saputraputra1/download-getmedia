const CACHE_NAME = 'mediaget-v4';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Install Event
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Fetch Event
self.addEventListener('fetch', (e) => {
  // Hanya intercept GET request dan bukan API/proxy requests
  if (e.request.method === 'GET' && !e.request.url.includes('/api/')) {
    e.respondWith(
      caches.match(e.request).then((response) => {
        return response || fetch(e.request).then((fetchRes) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request.url, fetchRes.clone());
            return fetchRes;
          });
        });
      })
    );
  }
});

// Activate Event
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});
