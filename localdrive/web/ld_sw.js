// Service Worker for Local Drive offline web access and PWA support.
'use strict';

const CACHE_NAME = 'localdrive-shell-v2';

const CORE_ASSETS = [
  './',
  'index.html',
  'flutter.js',
  'flutter_bootstrap.js',
  'main.dart.js',
  'manifest.json',
  'favicon.png',
  'icons/Icon-192.png',
  'icons/Icon-512.png',
  'canvaskit/canvaskit.js',
  'canvaskit/canvaskit.wasm',
  'sqlite3.wasm',
  'drift_worker.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        CORE_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Could not pre-cache asset:', url, err);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
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

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Do not intercept API calls or WebSocket connections
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/ws')) {
    return;
  }

  // For HTML navigation requests, return index.html on network failure
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match('./index.html').then((cached) => {
          return cached || caches.match('index.html');
        });
      })
    );
    return;
  }

  // For static assets: try network first to stay fresh, fallback to cache when offline
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request);
      })
  );
});
