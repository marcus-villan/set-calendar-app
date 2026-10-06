// Service worker: lets Set open with no internet, and makes it installable on Android/desktop.
//
// A service worker is a script the browser keeps running in the background for this site. It can
// answer the page's network requests from a saved copy (a "cache").
//
// Rules (deliberately conservative):
//   - Only GET requests for files on OUR site and inside the app's folder are handled. Requests to
//     Supabase (sign-in, your sets) are never intercepted and never cached, so no account data is
//     stored here and sync always talks to the real server.
//   - Pages: try the network first so updates arrive immediately; fall back to the saved copy offline.
//   - Built files in /assets/ have a unique hash in their name and never change: saved copy first.
//   - Everything else (icons, boot.js, manifest): saved copy now, refresh it in the background.
// Bump VERSION to throw away every saved file on the next visit.
const VERSION = 'v1';
const CACHE = `set-${VERSION}`;
const SCOPE = self.registration.scope;              // e.g. https://marcus-villan.github.io/set-calendar-app/
const at = (path) => new URL(path, SCOPE).href;
const HOME = at('./');
const PRIVACY = at('privacy.html');
const SHELL = [HOME, PRIVACY, at('boot.js'), at('manifest.webmanifest'), at('favicon.svg'), at('favicon.ico'),
  at('icons/apple-touch-icon.png'), at('icons/icon-192.png'), at('icons/icon-512.png')];
const PAGE_TIMEOUT_MS = 4000;
// Servers add a "Vary" header (GitHub Pages: Accept-Encoding; the local preview: Origin). By default
// that makes a saved file count as a DIFFERENT response when the page asks for it slightly differently
// (e.g. <script crossorigin>), and the lookup misses. Our files are identical for everyone, so ignore it.
const MATCH = { ignoreVary: true };

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL.map(url => new Request(url, { cache: 'reload' })));

    // The page that installs us already downloaded its script and stylesheet before we existed, so
    // read their addresses out of the page and save them too. Then the next launch works offline.
    const html = await (await cache.match(HOME, MATCH)).text();
    const assets = [...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)].map(m => new URL(m[1], HOME).href);
    await cache.addAll(assets);

    // Same for the font the stylesheet points to (the basic Latin file; others load on demand).
    try {
      for (const cssUrl of assets.filter(url => url.endsWith('.css'))) {
        const css = await (await cache.match(cssUrl, MATCH)).text();
        const fonts = [...css.matchAll(/url\(([^)]+?latin-wght[^)]+?\.woff2)\)/g)].map(m => new URL(m[1].replace(/["']/g, ''), cssUrl).href);
        await cache.addAll(fonts);
      }
    } catch (err) { /* fonts are optional: the app falls back to the system font */ }

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('set-') && name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

// Only successful, same-origin responses are ever saved.
const cacheable = (response) => response && response.ok && response.type === 'basic';

async function pageNetworkFirst(request, key) {
  const cache = await caches.open(CACHE);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), PAGE_TIMEOUT_MS))
    ]);
    if (cacheable(response)) cache.put(key, response.clone());
    return response;
  } catch (err) {
    const saved = await cache.match(key, MATCH);
    return saved ?? new Response('You are offline, and Set has not been saved on this device yet.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const saved = await cache.match(request, MATCH);
  if (saved) return saved;
  const response = await fetch(request);
  if (cacheable(response)) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const saved = await cache.match(request, MATCH);
  const refresh = fetch(request).then(response => {
    if (cacheable(response)) cache.put(request, response.clone());
    return response;
  });
  if (saved) { refresh.catch(() => {}); return saved; }
  return refresh;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;                                   // never touch writes
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(SCOPE)) return;   // never touch other sites (Supabase, Google)

  if (request.mode === 'navigate') {
    // Any page address inside the app (including the "?code=..." return from Google sign-in) is the same app page.
    const key = url.pathname.endsWith('/privacy.html') ? PRIVACY : HOME;
    event.respondWith(pageNetworkFirst(request, key));
  } else if (url.pathname.includes('/assets/')) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(staleWhileRevalidate(request));
  }
});
