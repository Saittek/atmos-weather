/* Atmos PWA service worker — offline shell + SPA routes */
const CACHE = 'atmos-v3'
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

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Never cache live weather / map tiles
  if (
    url.hostname.includes('open-meteo') ||
    url.hostname.includes('rainviewer') ||
    url.hostname.includes('weather.gov') ||
    url.hostname.includes('nhc.noaa.gov') ||
    url.hostname.includes('nominatim') ||
    url.hostname.includes('tile') ||
    url.hostname.includes('basemaps') ||
    url.hostname.includes('arcgisonline') ||
    url.hostname.includes('cartocdn')
  ) {
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

  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(request, copy))
          return res
        })
        .catch(() => caches.match(request).then((r) => r || caches.match('/index.html'))),
    )
  }
})
