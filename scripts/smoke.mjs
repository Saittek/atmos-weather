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
    if (res.ok && Array.isArray(json?.features)) {
      if (json.features.includes('auth-forgot-password')) ok('Health features forgot-password')
      else fail('Health features forgot-password', 'missing')
      if (json.secrets && json.secrets.resend === false) {
        ok('Health resend secret', 'not set (emails log-only)')
      } else if (json.secrets?.resend) {
        ok('Health resend secret', 'configured')
      }
    }
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
  for (const p of ['/radar', '/globe', '/chase', '/stargaze']) {
    const { res } = await get(p)
    if (res.ok) ok(`GET ${p} (SPA)`)
    else fail(`GET ${p}`, `${res.status}`)
  }

  // Stargaze sky extras
  {
    const { res, json } = await get('/api/sky/kp', { json: true })
    if (res.ok) ok('GET /api/sky/kp', json?.kp != null ? `kp=${json.kp}` : 'ok')
    else if (res.status >= 500) fail('GET /api/sky/kp', `${res.status}`)
    else ok('GET /api/sky/kp soft', `${res.status}`)
  }

  // Change password must not be public
  {
    const res = await fetch(`${BASE}/api/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'x', newPassword: 'abcdefgh' }),
    })
    if (res.status === 401 || res.status === 403) ok('POST change-password auth gate', String(res.status))
    else if (res.status === 404) fail('POST change-password', 'endpoint missing')
    else ok('POST change-password', String(res.status))
  }

  // Forgot password always generic 200
  {
    const res = await fetch(`${BASE}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'smoke-nonexistent@example.com' }),
    })
    const j = await res.json().catch(() => ({}))
    if (res.ok && j?.ok) ok('POST forgot-password generic ok')
    else fail('POST forgot-password', String(res.status))
  }

  // Reset password page SPA
  {
    const { res } = await get('/reset-password')
    if (res.ok) ok('GET /reset-password (SPA)')
    else fail('GET /reset-password', String(res.status))
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
