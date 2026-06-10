/**
 * Agent Genesis — Service Worker
 *
 * Strategy: cache-first for static built assets, network-first for the rest.
 * We deliberately DO NOT cache runtime API responses or game saves —
 * saves live in LocalStorage in the page itself, and there's no backend yet.
 *
 * Cache versioning: bump CACHE_NAME to force clients to revalidate.
 * On activate, we delete any old caches so they don't accumulate.
 *
 * Type notes: ServiceWorkerGlobalScope lives in `lib.dom.d.ts`, but mixing
 * DOM with WebWorker causes a `self` redeclare conflict. The WebWorker lib
 * gives us WorkerGlobalScope, which has `clients`, `caches`, `skipWaiting`,
 * `addEventListener`, etc. — exactly what we need. The few bits that are
 * ServiceWorkerGlobalScope-only (ExtendableEvent.waitUntil, FetchEvent,
 * FetchEvent.respondWith) come through the AddEventListener overloads when
 * the listener is typed as (e: any) => void, which is what we do here.
 *
 * The production build goes through esbuild, which doesn't type-check at
 * all, so the runtime behavior is correct regardless of TS's complaints.
 */

const CACHE_NAME = 'agent-genesis-v1';
const STATIC_CACHE = `${CACHE_NAME}-static`;

// Precache the shell on install. Vite's `import.meta.url`-based asset URLs
// can't be hard-coded here (they have content hashes), so we use a runtime
// cache-on-first-fetch strategy instead. That way the SW always works with
// whatever the current build produced, without manual sync.
const SHELL_PATHS = ['/', '/manifest.webmanifest'];

// The listeners take `any` event types so we don't have to fight the TS lib
// split. Inside, we cast to the specific interfaces we need. Runtime is
// correct; types are intentionally loose here.
// `self` in a ServiceWorker context is the ServiceWorkerGlobalScope, which
// has the SW-specific bits (`skipWaiting`, `clients.claim`, etc.) on top of
// WorkerGlobalScope. We use a type assertion to bridge the lib split.
const sw = self as unknown as ServiceWorkerGlobalScope;

self.addEventListener('install', (event: any) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(SHELL_PATHS).catch(() => {}))
      .then(() => sw.skipWaiting()),
  );
});

self.addEventListener('activate', (event: any) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)));
      await sw.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event: any) => {
  const req = event.request as Request;

  // Only handle GETs. Anything else (POST/PUT/etc.) goes straight to network.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Same-origin only. Don't try to cache cross-origin stuff (CDNs, fonts, etc.)
  // — we don't ship any today, but defensive: if we add one, handle it explicitly.
  if (url.origin !== self.location.origin) return;

  // Skip the dev HMR / Vite endpoints — those should always be live.
  if (url.pathname.startsWith('/@vite') || url.pathname.startsWith('/@fs')) return;

  // Cache-first for static assets, network-falling-back-to-cache for everything else.
  event.respondWith(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(req);
      if (cached) {
        // Background revalidate (stale-while-revalidate pattern for the shell).
        fetch(req)
          .then((res) => {
            if (res && res.status === 200 && res.type === 'basic') {
              cache.put(req, res.clone()).catch(() => {});
            }
          })
          .catch(() => {});
        return cached;
      }

      try {
        const res = await fetch(req);
        // Cache successful, same-origin, basic responses (HTML/CSS/JS/JSON/icons).
        if (res && res.status === 200 && res.type === 'basic') {
          cache.put(req, res.clone()).catch(() => {});
        }
        return res;
      } catch (err) {
        // Offline + not in cache: return a minimal offline shell for navigations.
        if (req.mode === 'navigate') {
          const shell = await cache.match('/');
          if (shell) return shell;
        }
        throw err;
      }
    })(),
  );
});
