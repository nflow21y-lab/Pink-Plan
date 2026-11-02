// 핑키 플랜 - PWA 서비스 워커
const CACHE_NAME = 'pinky-plan-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './popup.html',
  './style.css',
  './app.js',
  './cloudSync.js',
  './manifest.webmanifest',
  './icons/icon16.png',
  './icons/icon48.png',
  './icons/icon128.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('kvdb.io') || e.request.url.includes('firebaseio.com') || e.request.url.includes('api.restful-api.dev')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return (
        cachedResponse ||
        fetch(e.request).catch(() => caches.match('./index.html'))
      );
    })
  );
});
