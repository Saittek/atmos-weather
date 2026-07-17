/* Solara PWA — network-first HTML, cache hashed assets only */
const CACHE = 'solara-v4'

self.addEventListener('install', (event) => {
  // Activate immediately so mobile clients leave broken old caches
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
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
    hostname.includes('gstatic') ||
    hostname.includes('imagine-public')
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  let url
  try {
    url = new URL(request.url)
  } catch {
    return
  }

  // Never cache API / live weather / tiles
  if (url.pathname.startsWith('/api') || isLiveHost(url.hostname)) {
    return
  }

  // Navigations & HTML: always network-first (avoids white screen after deploys)
  const accept = request.headers.get('accept') || ''
  const isHtmlNav =
    request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname.endsWith('.html') ||
    accept.includes('text/html')

  if (isHtmlNav && url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put('/index.html', copy)).catch(() => {})
          }
          return res
        })
        .catch(() =>
          caches.match('/index.html').then((r) => r || caches.match('/')),
        ),
    )
    return
  }

  if (url.origin !== self.location.origin) return

  // Hashed JS/CSS: cache-first (filename changes every deploy)
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {})
          }
          return res
        })
      }),
    )
    return
  }

  // Icons / static: stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {})
          }
          return res
        })
        .catch(() => cached)
      return cached || network
    }),
  )
})
