// Seshd service worker — offline app-shell + safe update strategy.
//
// Goal: the app must COLD-START with no network (gym dead zones), without ever trapping users on a
// stale/broken build. Strategy:
//   • Navigation requests (the HTML doc): NETWORK-FIRST, fall back to cached shell when offline.
//     This means an online launch always gets the freshest build; offline launch uses the cache.
//   • Static assets (JS/CSS/fonts/images, content-hashed by Vite): CACHE-FIRST, since their
//     filenames change every build, so cached copies are never stale for a given build.
//   • On activate: delete old caches so storage doesn't grow unbounded across deploys.
//
// IMPORTANT: bump CACHE_VERSION whenever you want to force-refresh the precache. The network-first
// navigation strategy already prevents stale HTML, so manual bumps are rarely needed.

const CACHE_VERSION = "seshd-v1";
const SHELL_URL = "/index.html";

// Install: precache the app shell. skipWaiting so a new SW activates promptly.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(["/", SHELL_URL]).catch(() => {}))
  );
  self.skipWaiting();
});

// Activate: clean up caches from older versions, take control of open pages.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only handle GET. Never touch API/auth/realtime/storage — those must always hit the network and
  // are handled by the app's own offline queue, not the SW cache.
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;            // skip Supabase, CDNs, etc.
  if (url.pathname.startsWith("/api/")) return;               // serverless functions
  if (url.pathname.startsWith("/auth/")) return;

  // Navigation (loading the app document): network-first so an online launch is always fresh;
  // fall back to the cached shell when offline so the app still opens.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(SHELL_URL, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(SHELL_URL).then((r) => r || caches.match("/")))
    );
    return;
  }

  // Static assets (Vite outputs content-hashed filenames → safe to cache forever for that build).
  // Cache-first, then network, and populate the cache on first fetch.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});

// Allow the app to tell a waiting SW to activate immediately (used by the update flow).
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
