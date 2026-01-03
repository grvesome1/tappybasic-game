// Service Worker for PWA offline support
const CACHE_NAME = 'tappy-rocket-v2.0';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/pixi.min.js',
  '/assets/images/tbag-rocket-transparent.png',
  '/assets/images/red-candle-stick.png',
  '/assets/images/green-candle-stick.png',
  '/assets/images/gun.png',
  '/assets/images/slow.png',
  '/assets/images/sherk.png',
  '/assets/images/cece.png',
  '/assets/images/invincibility.png',
  '/assets/images/flame.png',
  '/assets/images/tbagburst.png',
  '/assets/images/tbagsecured.png',
  '/assets/audio/background.mp3',
  '/assets/audio/flap.mp3',
  '/assets/audio/explosion.mp3',
  '/assets/audio/gun.mp3',
  '/assets/audio/score.mp3'
];

// Install: Cache critical assets and activate immediately
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Force immediate activation
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      );
    })
  );
  return self.clients.claim();
});

// Fetch: Network-first strategy with cache fallback for offline support
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  const isNav = event.request.mode === 'navigate' || (event.request.headers.get('accept') || '').includes('text/html');

  function offlineResponse() {
    return new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Only cache successful responses
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Network failed, use cache as fallback
        if (isNav) {
          return caches.match('/index.html').then((r) => r || offlineResponse());
        }
        return caches.match(event.request).then((r) => r || offlineResponse());
      })
  );
});
