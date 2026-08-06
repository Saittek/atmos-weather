/**
 * Cron: check saved places for severe alerts and push notify subscribers.
 */
import { fetchAlertsForPoint, isNotifiableAlert } from './alerts.js'
import { sendWebPush } from './push-send.js'
import { isApnsConfigured, sendApns } from './apns.js'

function parseUserData(raw) {
  try {
    const d = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {}
    return d
  } catch {
    return {}
  }
}

function placeKey(lat, lon) {
  return `${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`
}

function parseHm(hm, fallbackMins) {
  if (typeof hm !== 'string' || !/^\d{1,2}:\d{2}$/.test(hm)) return fallbackMins
  const [h, m] = hm.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return fallbackMins
  return ((h % 24) * 60 + (m % 60) + 24 * 60) % (24 * 60)
}

/** Quiet hours in the worker (UTC wall clock — clients store local preference). */
function inQuietHours(data, date = new Date()) {
  if (!data?.quietHoursEnabled) return false
  const start = parseHm(data.quietStart, 22 * 60)
  const end = parseHm(data.quietEnd, 7 * 60)
  const now = date.getUTCHours() * 60 + date.getUTCMinutes()
  if (start === end) return false
  if (start < end) return now >= start && now < end
  return now >= start || now < end
}

function shouldSkipForQuiet(data, severity) {
  if (!inQuietHours(data)) return false
  const s = String(severity || '').toLowerCase()
  if (s === 'extreme') return false
  return true
}

/**
 * Lightweight clear-sky night check via Open-Meteo (cloud + precip, next ~12h night).
 * @returns {{ good: boolean, cloud: number, dayKey: string } | null}
 */
async function checkClearSkyNight(lat, lon) {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lon))
  url.searchParams.set('hourly', 'cloud_cover,precipitation_probability,is_day')
  url.searchParams.set('forecast_hours', '18')
  url.searchParams.set('timezone', 'auto')
  const res = await fetch(url.toString())
  if (!res.ok) return null
  const data = await res.json()
  const clouds = data.hourly?.cloud_cover ?? []
  const pop = data.hourly?.precipitation_probability ?? []
  const isDay = data.hourly?.is_day ?? []
  const nightCloud = []
  let maxPop = 0
  for (let i = 0; i < clouds.length; i++) {
    if (isDay[i] === 1) continue
    nightCloud.push(clouds[i] ?? 100)
    maxPop = Math.max(maxPop, pop[i] ?? 0)
  }
  if (nightCloud.length < 3) return null
  const mean = nightCloud.reduce((a, b) => a + b, 0) / nightCloud.length
  const good = mean <= 40 && maxPop <= 35
  const dayKey = new Date().toISOString().slice(0, 10)
  return { good, cloud: Math.round(mean), dayKey }
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {any} env
 */
export async function runAlertPushCron(env) {
  const db = env.DB
  if (!db) return { ok: false, error: 'no db' }
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return { ok: false, error: 'vapid not configured' }
  }

  // Users who want notifications
  const users = await db.prepare('SELECT id, data FROM users').all()
  const rows = users.results || []

  /** @type {Map<string, { lat: number, lon: number, name: string, userIds: Set<string> }>} */
  const places = new Map()
  /** @type {Map<string, { id: string, severeOnly: boolean, data: any }>} */
  const userMeta = new Map()

  for (const row of rows) {
    const data = parseUserData(row.data)
    if (!data.notifyAlerts) continue
    userMeta.set(row.id, {
      id: row.id,
      severeOnly: data.severeMode !== false,
      data,
    })

    const locs = []
    // Exact home first — highest priority for alerts
    if (data.homeLocation?.latitude != null) locs.push(data.homeLocation)
    if (data.lastLocation?.latitude != null) locs.push(data.lastLocation)
    if (Array.isArray(data.favorites)) {
      for (const f of data.favorites.slice(0, 8)) {
        if (f?.latitude != null) locs.push(f)
      }
    }
    for (const loc of locs) {
      const k = placeKey(loc.latitude, loc.longitude)
      if (!places.has(k)) {
        places.set(k, {
          lat: Number(loc.latitude),
          lon: Number(loc.longitude),
          name: String(loc.name || k),
          userIds: new Set(),
        })
      }
      places.get(k).userIds.add(row.id)
    }
  }

  // Cap fan-out per cron run
  const placeList = [...places.values()].slice(0, 40)
  let alertsChecked = 0
  let pushes = 0
  let errors = 0
  let clearSkyPushes = 0

  for (const place of placeList) {
    // Clear-sky night ping (stargazing) — once per local evening window key
    try {
      const clear = await checkClearSkyNight(place.lat, place.lon)
      if (clear?.good) {
        for (const userId of place.userIds) {
          const meta = userMeta.get(userId)
          if (!meta?.data?.notifyAlerts) continue
          if (shouldSkipForQuiet(meta.data, 'Minor')) continue
          const dayKey = `clearsky:${placeKey(place.lat, place.lon)}:${clear.dayKey}`
          const already = await db
            .prepare('SELECT 1 FROM push_sent WHERE user_id = ? AND alert_key = ?')
            .bind(userId, dayKey)
            .first()
          if (already) continue

          const payload = {
            title: 'Solara · clear-ish night',
            body: `${place.name}: clouds ~${clear.cloud}% tonight — good for stargazing?`,
            url: `/stargaze?lat=${place.lat.toFixed(4)}&lon=${place.lon.toFixed(4)}&name=${encodeURIComponent(place.name)}`,
            tag: dayKey,
            urgency: 'normal',
            topic: 'solara-stargaze',
          }

          const subs = await db
            .prepare(
              'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?',
            )
            .bind(userId)
            .all()
          let anyOk = false
          for (const sub of subs.results || []) {
            try {
              const result = await sendWebPush(env, sub, payload)
              if (result.status === 404 || result.status === 410) {
                await db.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(sub.id).run()
              } else if (result.ok) {
                anyOk = true
                pushes++
                clearSkyPushes++
              }
            } catch {
              errors++
            }
          }
          if (anyOk) {
            await db
              .prepare(
                'INSERT OR REPLACE INTO push_sent (user_id, alert_key, sent_at) VALUES (?, ?, ?)',
              )
              .bind(userId, dayKey, new Date().toISOString())
              .run()
          }
        }
      }
    } catch (e) {
      errors++
      console.error('clear-sky check fail', e)
    }

    const alerts = await fetchAlertsForPoint(place.lat, place.lon)
    alertsChecked += alerts.length

    for (const userId of place.userIds) {
      const meta = userMeta.get(userId)
      if (!meta) continue

      const subs = await db
        .prepare(
          'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?',
        )
        .bind(userId)
        .all()
      const subRows = subs.results || []

      const devices = await db
        .prepare(
          'SELECT id, token, platform FROM device_tokens WHERE user_id = ?',
        )
        .bind(userId)
        .all()
      const deviceRows = devices.results || []

      if (!subRows.length && !deviceRows.length) continue

      for (const alert of alerts) {
        if (!isNotifiableAlert(alert, { severeOnly: meta.severeOnly })) continue
        if (shouldSkipForQuiet(meta.data, alert.severity)) continue
        const alertKey = `${alert.source}:${alert.id}`

        const already = await db
          .prepare('SELECT 1 FROM push_sent WHERE user_id = ? AND alert_key = ?')
          .bind(userId, alertKey)
          .first()
        if (already) continue

        const payload = {
          title: `Solara: ${alert.event}`,
          body: `${alert.headline} · near ${place.name}`,
          url: `/chase?lat=${place.lat.toFixed(4)}&lon=${place.lon.toFixed(4)}&name=${encodeURIComponent(place.name)}`,
          tag: alertKey,
          urgency: alert.severityRank >= 4 ? 'high' : 'normal',
          topic: 'solara-alert',
        }

        let anyOk = false
        for (const sub of subRows) {
          try {
            const result = await sendWebPush(env, sub, payload)
            if (result.status === 404 || result.status === 410) {
              // Gone — drop subscription
              await db
                .prepare('DELETE FROM push_subscriptions WHERE id = ?')
                .bind(sub.id)
                .run()
            } else if (result.ok) {
              anyOk = true
              pushes++
            }
          } catch (e) {
            errors++
            console.error('push fail', e)
          }
        }

        // Native APNs when Apple secrets are configured
        if (isApnsConfigured(env)) {
          for (const dev of deviceRows) {
            if (dev.platform !== 'ios') continue
            try {
              const result = await sendApns(env, dev.token, payload)
              if (result.status === 410 || result.status === 400) {
                await db
                  .prepare('DELETE FROM device_tokens WHERE id = ?')
                  .bind(dev.id)
                  .run()
              } else if (result.ok) {
                anyOk = true
                pushes++
              } else if (!result.skipped) {
                errors++
              }
            } catch (e) {
              errors++
              console.error('apns fail', e)
            }
          }
        }

        if (anyOk) {
          await db
            .prepare(
              'INSERT OR REPLACE INTO push_sent (user_id, alert_key, sent_at) VALUES (?, ?, ?)',
            )
            .bind(userId, alertKey, new Date().toISOString())
            .run()
        }
      }
    }
  }

  // Prune old sent markers (30 days)
  const cutoff = new Date(Date.now() - 30 * 24 * 3600_000).toISOString()
  await db.prepare('DELETE FROM push_sent WHERE sent_at < ?').bind(cutoff).run()

  return {
    ok: true,
    users: userMeta.size,
    places: placeList.length,
    alertsChecked,
    pushes,
    clearSkyPushes,
    errors,
    apnsConfigured: isApnsConfigured(env),
  }
}
