// Service worker: caches the whole app so it works offline.
// Bump VERSION whenever any file changes, so phones pick up the new version.
const VERSION = 'v1';
const CACHE = `reactiontrainer-${VERSION}`;

const FILES = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'js/app.js',
  'js/audio.js',
  'js/exercises.js',
  'js/metronome.js',
  'js/scheduler.js',
  'js/session.js',
  'js/visuals.js',
  'js/wakelock.js',
  'sounds/tick-main.wav',
  'sounds/tick-sub.wav',
  'sounds/ring.wav',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Cache first, fall back to the network.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request)),
  );
});
