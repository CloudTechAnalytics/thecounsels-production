/*
 * The Counsel service worker: makes the app installable and quick to open.
 *
 * Deliberately caches ONLY the app shell (index.html, hashed JS/CSS bundles,
 * icons). Firm data (Supabase REST/Auth/Storage/Realtime, all cross-origin)
 * is never touched, so nothing confidential is stored on the device and every
 * screen still reads live data. Bump VERSION to force-drop old caches.
 */
const VERSION = 'counsel-shell-v1'
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/brand/counsel-symbol-gold.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return          // Supabase, fonts, Sentry: straight to network

  // Pages: always try the network first so a new deploy shows up immediately;
  // fall back to the cached shell only when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && !url.pathname.includes('.')) {
            const copy = res.clone()
            caches.open(VERSION).then((c) => c.put('/', copy))
          }
          return res
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('/'))),
    )
    return
  }

  // Vite's hashed bundles never change under the same name: cache-first.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)) }
        return res
      })),
    )
    return
  }

  // Icons and brand images: serve cached, refresh in the background.
  if (url.pathname.startsWith('/icons/') || url.pathname.startsWith('/brand/')) {
    event.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req).then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)) }
          return res
        }).catch(() => hit)
        return hit || net
      }),
    )
  }
})

// Tapping a notification opens (or focuses) the app on the right screen.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin) {
          return w.focus().then(() => ('navigate' in w ? w.navigate(target) : w))
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
