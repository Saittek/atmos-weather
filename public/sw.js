/* Solara PWA service worker — fast shell + immutable asset cache */
const CACHE = 'solara-v1'
const PRECACHE = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

function isLiveHost(hostname) {
  return (
    hostname.includes('open-meteo') ||
    hostname.includes('rainviewer') ||
    hostname.includes('weather.gov') ||
    hostname.includes('weather.gc.ca') ||
    hostname.includes('nhc.noaa.gov') ||
    hostname.includes('nominatim') ||
    hostname.includes('tile') ||
    hostname.includes('basemaps') ||
    hostname.includes('arcgisonline') ||
    hostname.includes('cartocdn') ||
    hostname.includes('firms.modaps') ||
    hostname.includes('googleapis') ||
    hostname.includes('gstatic')
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Never intercept API or live weather / map tiles
  if (url.pathname.startsWith('/api') || isLiveHost(url.hostname)) {
    return
  }

  // SPA navigation: network first, fall back to app shell
  if (request.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('/index.html', copy))
          return res
        })
        .catch(() =>
          caches.match('/index.html').then((r) => r || caches.match('/')),
        ),
    )
    return
  }

  if (url.origin !== self.location.origin) return

  // Hashed build assets: cache-first (immutable filenames)
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(request, copy))
          }
          return res
        })
      }),
    )
    return
  }

  // Other same-origin: stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(request, copy))
          }
          return res
        })
        .catch(() => cached || caches.match('/index.html'))
      return cached || network
    }),
  )
})
