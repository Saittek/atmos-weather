/* Solara PWA — network-first HTML, cache hashed assets only + Web Push */
const CACHE = 'solara-v7'

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

/** Server → phone alert notifications (even when tab closed) */
self.addEventListener('push', (event) => {
  let data = {
    title: 'Solara',
    body: 'Weather alert',
    url: '/',
    tag: 'solara',
  }
  try {
    if (event.data) {
      const parsed = event.data.json()
      data = { ...data, ...parsed }
    }
  } catch {
    try {
      const t = event.data && event.data.text()
      if (t) data.body = t
    } catch {
      /* ignore */
    }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Solara', {
      body: data.body || 'Weather update',
      icon: '/icons/icon-192.png',
      badge: '/icons/favicon-32.png',
      tag: data.tag || 'solara-alert',
      data: { url: data.url || '/' },
      renotify: true,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    }),
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

  // Hashed JS/CSS: cache-first (filename changes every deploy).
  // Never cache SPA HTML fallbacks as JS (causes white-screen after deploys).
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(async (cached) => {
        if (cached) {
          const ct = cached.headers.get('content-type') || ''
          if (ct.includes('javascript') || ct.includes('css') || ct.includes('text/css')) {
            return cached
          }
          // Bad cache entry (HTML mistaken for asset) — drop it
          caches.open(CACHE).then((c) => c.delete(request)).catch(() => {})
        }
        const res = await fetch(request)
        const ct = res.headers.get('content-type') || ''
        const looksLikeAsset =
          res.ok &&
          (ct.includes('javascript') ||
            ct.includes('css') ||
            ct.includes('text/css') ||
            ct.includes('wasm') ||
            ct.includes('font'))
        if (looksLikeAsset) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {})
        }
        return res
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
