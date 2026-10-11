/* Offline cache so the calculator keeps working with no signal. */
var CACHE = 'ti84-v2';
var ASSETS = [
  './', './index.html', './manifest.webmanifest', './css/calc.css',
  './js/font.js', './js/lcd.js', './js/state.js', './js/prgm.js', './js/keypad.js', './js/app.js',
  './js/math/tokens.js', './js/math/parser.js', './js/math/dec.js', './js/math/matrix.js',
  './js/math/evaluator.js', './js/math/format.js',
  './js/screens/menu.js', './js/screens/home.js', './js/screens/yequals.js',
  './js/screens/fields.js', './js/screens/settings.js', './js/screens/graph.js', './js/screens/table.js',
  './js/screens/prgmedit.js', './js/screens/matedit.js',
  './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  /* Network first so an updated build is picked up as soon as there is a
     connection, with the cache as the offline fallback. */
  e.respondWith(
    fetch(e.request).then(function (res) {
      if (res && res.status === 200 && res.type === 'basic') {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); }).catch(function () {});
      }
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (hit) {
        return hit || caches.match('./index.html');
      });
    })
  );
});
