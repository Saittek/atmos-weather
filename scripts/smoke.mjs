/**
 * E2E smoke tests against production (or SMOKE_BASE).
 * Usage: node scripts/smoke.mjs
 *        SMOKE_BASE=https://solaraweather.com node scripts/smoke.mjs
 */
const BASE = (process.env.SMOKE_BASE || 'https://solaraweather.com').replace(/\/$/, '')

const checks = []

function ok(name, detail = '') {
  checks.push({ name, pass: true, detail })
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`)
}
function fail(name, detail = '') {
  checks.push({ name, pass: false, detail })
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
}

async function get(path, opts = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { Accept: opts.json ? 'application/json' : '*/*', ...(opts.headers || {}) },
  })
  const text = await res.text()
  let json = null
  if (opts.json) {
    try {
      json = JSON.parse(text)
    } catch {
      /* ignore */
    }
  }
  return { res, text, json, url }
}

async function main() {
  console.log(`\nSolara smoke — ${BASE}\n`)

  // Health
  {
    const { res, json } = await get('/api/health', { json: true })
    if (res.ok && json?.ok) ok('GET /api/health', json.service || 'ok')
    else fail('GET /api/health', `${res.status}`)
  }

  // Tropical
  {
    const { res, json } = await get('/api/tropical', { json: true })
    if (res.ok && json && (Array.isArray(json.storms) || json.storms === undefined || typeof json === 'object'))
      ok('GET /api/tropical', `storms=${Array.isArray(json.storms) ? json.storms.length : '?'}`)
    else fail('GET /api/tropical', `${res.status}`)
  }

  // VAPID public (push configured or empty)
  {
    const { res, json } = await get('/api/push/vapid-public-key', { json: true })
    if (res.ok) ok('GET /api/push/vapid-public-key', json?.publicKey ? 'configured' : 'empty ok')
    else fail('GET /api/push/vapid-public-key', `${res.status}`)
  }

  // Auth rate-limit shape (no real account)
  {
    const { res, json } = await get('/api/auth/me', { json: true })
    if (res.status === 401 || res.status === 403) ok('GET /api/auth/me unauth', String(res.status))
    else if (res.ok) ok('GET /api/auth/me', 'session present')
    else fail('GET /api/auth/me', `${res.status} ${json?.error || ''}`)
  }

  // SPA shell
  {
    const { res, text } = await get('/')
    if (res.ok && (text.includes('root') || text.includes('Solara'))) ok('GET / SPA shell')
    else fail('GET / SPA shell', `${res.status}`)
  }

  // SEO landings
  for (const p of ['/live-radar.html', '/hurricane-tracker.html']) {
    const { res, text } = await get(p)
    if (res.ok && text.length > 200) ok(`GET ${p}`)
    else fail(`GET ${p}`, `${res.status}`)
  }

  // Client routes (SPA fallback should still 200)
  for (const p of ['/radar', '/globe', '/chase']) {
    const { res } = await get(p)
    if (res.ok) ok(`GET ${p} (SPA)`)
    else fail(`GET ${p}`, `${res.status}`)
  }

  // Metrics endpoint accepts POST (may 204/200)
  {
    const res = await fetch(`${BASE}/api/metrics/page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '/smoke', sid: 'smoke-test' }),
    })
    if (res.ok || res.status === 204) ok('POST /api/metrics/page', String(res.status))
    else fail('POST /api/metrics/page', String(res.status))
  }

  const failed = checks.filter((c) => !c.pass)
  console.log(`\n${checks.length - failed.length}/${checks.length} passed\n`)
  if (failed.length) {
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
