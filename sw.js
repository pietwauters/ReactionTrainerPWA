// Service worker: caches the whole app so it works offline.
// Bump VERSION whenever any file changes, so phones pick up the new version.
const VERSION = 'v8';
const CACHE = `reactiontrainer-${VERSION}`;

const FILES = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'js/app.js',
  'js/audio.js',
  'js/ducker.js',
  'js/exercises.js',
  'js/library.js',
  'js/picker.js',
  'js/editor.js',
  'js/metronome.js',
  'js/scheduler.js',
  'js/session.js',
  'js/visuals.js',
  'js/wakelock.js',
  'sounds/tick-main.wav',
  'sounds/tick-sub.wav',
  'sounds/ring.wav',
  'sounds/duck-hold.wav',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
  'icons/share-qr.svg',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' bypasses the browser's HTTP cache, so a new version never
  // mixes in files that are still cached from the previous one.
  const requests = FILES.map((f) => new Request(f, { cache: 'reload' }));
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(requests)).then(() => self.skipWaiting()));
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
