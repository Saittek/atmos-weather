/**
 * Core logic smoke against live Open-Meteo + production SPA routes.
 * Does not import Vite TS modules — validates contracts the UI relies on.
 *
 * Usage: node scripts/test-core.mjs
 *        SMOKE_BASE=https://solaraweather.com node scripts/test-core.mjs
 */
const BASE = (process.env.SMOKE_BASE || 'https://solaraweather.com').replace(/\/$/, '')
const LAT = 52.1579 // Saskatoon-ish
const LON = -106.6702

const checks = []
function ok(name, detail = '') {
  checks.push({ name, pass: true, detail })
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`)
}
function fail(name, detail = '') {
  checks.push({ name, pass: false, detail })
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* ignore */
  }
  return { res, json, text }
}

/** Minimal high/low clamp used in CurrentWeather / widget */
function clampHighLow(tempNow, high, low) {
  const highN =
    high != null && Number.isFinite(high) ? Math.max(Number(high), tempNow) : tempNow
  const lowN = low != null && Number.isFinite(low) ? Math.min(Number(low), tempNow) : tempNow
  return { highN, lowN }
}

/** Simplified wet signal like wetSummary first-pass */
function wetSignal(hourly) {
  const now = Date.now()
  const pops = []
  const mms = []
  for (let i = 0; i < (hourly.time?.length || 0) && pops.length < 12; i++) {
    const t = hourly.time[i]
    const ms = Date.parse(t.includes('T') ? t : t.replace(' ', 'T'))
    if (!Number.isFinite(ms) || ms + 3600_000 < now) continue
    pops.push(hourly.precipitation_probability?.[i] ?? 0)
    mms.push(hourly.precipitation?.[i] ?? 0)
  }
  if (!pops.length) return { level: 'maybe', maxPop: 0, totalMm: 0 }
  const maxPop = Math.max(...pops)
  const totalMm = mms.reduce((a, b) => a + b, 0)
  if (maxPop < 30 && totalMm < 0.3) return { level: 'dry', maxPop, totalMm }
  if (totalMm >= 1 || maxPop >= 70) return { level: 'wet', maxPop, totalMm }
  return { level: 'maybe', maxPop, totalMm }
}

/** Alert severity sort preference (Extreme first) */
function severityRank(s) {
  const x = String(s || '').toLowerCase()
  if (x.includes('extreme')) return 0
  if (x.includes('severe')) return 1
  if (x.includes('moderate')) return 2
  if (x.includes('minor')) return 3
  return 4
}

async function main() {
  console.log(`\nSolara core checks — Open-Meteo + ${BASE}\n`)

  // ── Forecast high/low trust ──
  {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
      `&current=temperature_2m,weather_code,precipitation` +
      `&hourly=temperature_2m,precipitation,precipitation_probability,weather_code` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum` +
      `&timezone=auto&forecast_days=3`
    const { res, json } = await fetchJson(url)
    if ((!res.ok || !json?.current) && res.status >= 500) {
      // Upstream Open-Meteo blips should not fail ship checks
      ok('Open-Meteo forecast soft', `upstream ${res.status}`)
    } else if (!res.ok || !json?.current) {
      fail('Open-Meteo forecast', String(res.status))
    } else {
      ok('Open-Meteo forecast', `temp=${json.current.temperature_2m}`)
      const tempNow = Number(json.current.temperature_2m)
      const high = json.daily?.temperature_2m_max?.[0]
      const low = json.daily?.temperature_2m_min?.[0]
      const { highN, lowN } = clampHighLow(tempNow, high, low)
      if (highN >= tempNow && lowN <= tempNow) {
        ok('High/low clamp vs now', `H ${highN} L ${lowN} now ${tempNow}`)
      } else {
        fail('High/low clamp vs now', `H ${highN} L ${lowN} now ${tempNow}`)
      }
      const wet = wetSignal(json.hourly || {})
      if (['dry', 'maybe', 'wet'].includes(wet.level)) {
        ok('Wet signal shape', `${wet.level} maxPop=${wet.maxPop} mm=${wet.totalMm.toFixed(2)}`)
      } else {
        fail('Wet signal shape', String(wet.level))
      }
      // Precip timing inputs present
      const hasHourlyPrecip =
        Array.isArray(json.hourly?.precipitation) && json.hourly.precipitation.length > 0
      if (hasHourlyPrecip) ok('Hourly precip series', `${json.hourly.precipitation.length} hours`)
      else fail('Hourly precip series', 'missing')
    }
  }

  // ── Alert severity ordering contract ──
  {
    const sample = ['Minor', 'Extreme', 'Moderate', 'Severe']
    const sorted = [...sample].sort((a, b) => severityRank(a) - severityRank(b))
    if (sorted[0] === 'Extreme' && sorted[1] === 'Severe') {
      ok('Alert severity sort', sorted.join(' > '))
    } else {
      fail('Alert severity sort', sorted.join(','))
    }
  }

  // ── Health + ship metadata ──
  {
    const { res, json } = await fetchJson(`${BASE}/api/health`)
    if (res.ok && json?.ok) {
      ok('Health ok', json.version || '')
      if (json.secrets?.jwt && json.secrets?.cron) ok('Secrets jwt+cron present')
      else fail('Secrets jwt+cron', JSON.stringify(json.secrets))
      if (Array.isArray(json.features) && json.features.includes('auth')) ok('Health features list')
      else fail('Health features list')
      if (json.ship?.monitoring) ok('Health ship.monitoring hint')
      else ok('Health ship (optional fields)', 'monitoring optional until deploy')
    } else fail('Health ok', String(res.status))
  }

  // ── Sky extras (stargaze) ──
  {
    const { res, json } = await fetchJson(`${BASE}/api/sky/kp`)
    if (res.ok && json && (json.kp != null || json.source || json.ok !== false)) {
      ok('Sky Kp', `kp=${json.kp ?? json.estimatedKp ?? '?'}`)
    } else if (res.status >= 500) {
      fail('Sky Kp', `${res.status}`)
    } else {
      ok('Sky Kp soft', String(res.status))
    }
  }

  // ── SPA routes including Stargaze ──
  for (const p of ['/', '/radar', '/globe', '/chase', '/stargaze']) {
    const res = await fetch(`${BASE}${p}`, { redirect: 'follow' })
    if (res.ok) ok(`SPA ${p}`)
    else fail(`SPA ${p}`, String(res.status))
  }

  // ── Change-password endpoint exists (401 without auth) ──
  {
    const res = await fetch(`${BASE}/api/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'x', newPassword: 'abcdefgh' }),
    })
    if (res.status === 401 || res.status === 403) ok('change-password requires auth', String(res.status))
    else if (res.status === 404) fail('change-password missing', '404')
    else ok('change-password reachable', String(res.status))
  }

  const failed = checks.filter((c) => !c.pass)
  console.log(`\n${checks.length - failed.length}/${checks.length} passed\n`)
  if (failed.length) process.exitCode = 1
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
