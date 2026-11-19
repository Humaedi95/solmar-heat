/* Solmar Heat PWA service worker: cache-first, so the game plays offline once installed. */
const CACHE = 'solmar-heat-v1';
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './src/main.js',
  './src/actors.js',
  './src/audio.js',
  './src/city.js',
  './src/config.js',
  './src/input.js',
  './src/missions.js',
  './src/random.js',
  './src/render.js',
  './src/save.js',
  './assets/solmar-heat-theme.mp3',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(
      (cached) => cached || fetch(event.request),
    ),
  );
});
