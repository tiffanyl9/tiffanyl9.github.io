/* Caches the app shell so it opens with no connection. It never fetches anything
   from anywhere but this app's own files, and your data never touches it. */
const CACHE = 'budget-v2';
const SHELL = [
  './', './index.html', './styles.css', './app.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png'
];

self.addEventListener('install', e => {
  // 'reload' skips the browser's ordinary HTTP cache, so a fresh install really does
  // fetch the current files rather than whatever was cached up to ten minutes ago.
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // Network first so edits show up promptly; cache is the offline fallback. GitHub Pages
  // sends a ~10 minute max-age, so ask the server to revalidate rather than letting the
  // browser hand back a stale copy — otherwise "network first" quietly means "cache first".
  e.respondWith(
    fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }))
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
  );
});
