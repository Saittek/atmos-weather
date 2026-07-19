/**
 * Lightweight alert fetch for Worker cron (NWS US + ECCC Canada).
 */

export async function fetchAlertsForPoint(lat, lon) {
  const [us, ca] = await Promise.all([
    fetchNwsAlerts(lat, lon),
    fetchEcccAlerts(lat, lon),
  ])
  return [...ca, ...us]
}

async function fetchNwsAlerts(lat, lon) {
  try {
    const res = await fetch(
      `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`,
      {
        headers: {
          Accept: 'application/geo+json',
          'User-Agent': 'SolaraWeather/1.0 (https://solaraweather.com; alerts-cron)',
        },
      },
    )
    if (!res.ok) return []
    const data = await res.json()
    const features = data.features || []
    return features.map((f) => {
      const p = f.properties || {}
      const id = String(p.id || f.id || `${p.event}-${p.sent}`)
      const severity = String(p.severity || 'Unknown')
      return {
        id,
        event: String(p.event || 'Weather alert'),
        headline: String(p.headline || p.event || 'Alert'),
        severity,
        severityRank: severityRank(severity),
        source: 'nws',
      }
    })
  } catch {
    return []
  }
}

async function fetchEcccAlerts(lat, lon) {
  try {
    const pad = 0.75
    const bbox = `${lon - pad},${lat - pad},${lon + pad},${lat + pad}`
    const url = `https://api.weather.gc.ca/collections/weather-alerts/items?f=json&limit=30&bbox=${bbox}`
    const res = await fetch(url, {
      headers: { Accept: 'application/geo+json, application/json' },
    })
    if (!res.ok) return []
    const data = await res.json()
    const features = data.features || []
    return features.map((f) => {
      const p = f.properties || {}
      const id = String(p.id || f.id || p.identifier || JSON.stringify(p).slice(0, 40))
      const event =
        pickEn(p.event) ||
        pickEn(p.alertType) ||
        pickEn(p.headline) ||
        'Weather alert'
      const headline = pickEn(p.headline) || pickEn(p.description) || event
      const severity = mapEcccSeverity(p)
      return {
        id,
        event: String(event),
        headline: String(headline).slice(0, 180),
        severity,
        severityRank: severityRank(severity),
        source: 'eccc',
      }
    })
  } catch {
    return []
  }
}

function pickEn(v) {
  if (v == null) return null
  if (typeof v === 'string') return v
  if (typeof v === 'object' && v.en) return v.en
  return null
}

function mapEcccSeverity(p) {
  const raw = String(
    pickEn(p.severity) || pickEn(p.priority) || pickEn(p.type) || '',
  ).toLowerCase()
  if (raw.includes('extreme') || raw.includes('emergency')) return 'Extreme'
  if (raw.includes('severe') || raw.includes('warning')) return 'Severe'
  if (raw.includes('moderate') || raw.includes('watch')) return 'Moderate'
  if (raw.includes('minor') || raw.includes('advisory') || raw.includes('statement'))
    return 'Minor'
  return 'Unknown'
}

function severityRank(s) {
  switch (String(s)) {
    case 'Extreme':
      return 4
    case 'Severe':
      return 3
    case 'Moderate':
      return 2
    case 'Minor':
      return 1
    default:
      return 0
  }
}

/** Keep Severe+ by default; include Moderate if user wants all (we send Severe+) */
export function isNotifiableAlert(a, { severeOnly = true } = {}) {
  if (severeOnly) return a.severityRank >= 3
  return a.severityRank >= 2
}
