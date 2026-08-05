/**
 * Rough ISS visible pass predictor from Celestrak TLE (circular-orbit approx).
 * Good enough for “next few flyovers” — not operational-grade SGP4.
 */

function parseTleMeanMotion(tleText) {
  const lines = tleText
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  // Celestrak may return name + L1 + L2
  let l1 = lines.find((l) => l.startsWith('1 '))
  let l2 = lines.find((l) => l.startsWith('2 '))
  if (!l1 || !l2) {
    if (lines.length >= 3) {
      l1 = lines[1]
      l2 = lines[2]
    } else if (lines.length === 2) {
      l1 = lines[0]
      l2 = lines[1]
    }
  }
  if (!l2 || l2.length < 63) throw new Error('Bad TLE')
  const meanMotion = parseFloat(l2.slice(52, 63).trim()) // rev/day
  const inclination = parseFloat(l2.slice(8, 16).trim())
  const raan = parseFloat(l2.slice(17, 25).trim())
  const ecc = parseFloat('0.' + l2.slice(26, 33).trim())
  const argp = parseFloat(l2.slice(34, 42).trim())
  const meanAnom = parseFloat(l2.slice(43, 51).trim())
  const epoch = l1.slice(18, 32).trim()
  return { meanMotion, inclination, raan, ecc, argp, meanAnom, epoch }
}

function epochToMs(epochStr) {
  // YYDDD.FFFFFFFF
  const y = parseInt(epochStr.slice(0, 2), 10)
  const year = y < 57 ? 2000 + y : 1900 + y
  const day = parseFloat(epochStr.slice(2))
  const start = Date.UTC(year, 0, 1)
  return start + (day - 1) * 86400000
}

function deg2rad(d) {
  return (d * Math.PI) / 180
}
function rad2deg(r) {
  return (r * 180) / Math.PI
}

function gmstDeg(ms) {
  // rough GMST
  const jd = ms / 86400000 + 2440587.5
  const t = (jd - 2451545.0) / 36525
  let gmst =
    280.46061837 +
    360.98564736629 * (jd - 2451545) +
    0.000387933 * t * t -
    (t * t * t) / 38710000
  gmst = ((gmst % 360) + 360) % 360
  return gmst
}

/**
 * Propagate circular-ish orbit; return sub-satellite lat/lon and height km.
 */
function satLatLon(elems, ms) {
  const mu = 398600.4418 // km^3/s^2
  const n = (elems.meanMotion * 2 * Math.PI) / 86400 // rad/s
  const a = Math.cbrt(mu / (n * n))
  const epochMs = epochToMs(elems.epoch)
  const dt = (ms - epochMs) / 1000
  const M = deg2rad(elems.meanAnom) + n * dt
  // eccentric anomaly approx for small e
  let E = M
  for (let i = 0; i < 6; i++) {
    E = M + elems.ecc * Math.sin(E)
  }
  const nu =
    2 *
    Math.atan2(
      Math.sqrt(1 + elems.ecc) * Math.sin(E / 2),
      Math.sqrt(1 - elems.ecc) * Math.cos(E / 2),
    )
  const i = deg2rad(elems.inclination)
  const O = deg2rad(elems.raan) // not precessing in this approx
  const w = deg2rad(elems.argp)
  const u = w + nu
  const x = a * (Math.cos(O) * Math.cos(u) - Math.sin(O) * Math.sin(u) * Math.cos(i))
  const y = a * (Math.sin(O) * Math.cos(u) + Math.cos(O) * Math.sin(u) * Math.cos(i))
  const z = a * (Math.sin(u) * Math.sin(i))
  const r = Math.sqrt(x * x + y * y + z * z)
  const lat = rad2deg(Math.asin(z / r))
  const lonEci = rad2deg(Math.atan2(y, x))
  const gst = gmstDeg(ms)
  let lon = lonEci - gst
  lon = ((lon + 540) % 360) - 180
  return { lat, lon, altKm: r - 6371 }
}

function elevationAzimuth(obsLat, obsLon, satLat, satLon, altKm) {
  const R = 6371
  const oLat = deg2rad(obsLat)
  const oLon = deg2rad(obsLon)
  const sLat = deg2rad(satLat)
  const sLon = deg2rad(satLon)
  const ox = R * Math.cos(oLat) * Math.cos(oLon)
  const oy = R * Math.cos(oLat) * Math.sin(oLon)
  const oz = R * Math.sin(oLat)
  const rs = R + altKm
  const sx = rs * Math.cos(sLat) * Math.cos(sLon)
  const sy = rs * Math.cos(sLat) * Math.sin(sLon)
  const sz = rs * Math.sin(sLat)
  const dx = sx - ox
  const dy = sy - oy
  const dz = sz - oz
  const range = Math.sqrt(dx * dx + dy * dy + dz * dz)
  // topocentric ENU
  const south = Math.sin(oLat) * Math.cos(oLon) * dx + Math.sin(oLat) * Math.sin(oLon) * dy - Math.cos(oLat) * dz
  const east = -Math.sin(oLon) * dx + Math.cos(oLon) * dy
  const up = Math.cos(oLat) * Math.cos(oLon) * dx + Math.cos(oLat) * Math.sin(oLon) * dy + Math.sin(oLat) * dz
  const el = rad2deg(Math.asin(up / range))
  let az = rad2deg(Math.atan2(east, -south))
  if (az < 0) az += 360
  return { el, az, range }
}

function cardinal(az) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round(az / 45) % 8]
}

export async function computeIssPasses(lat, lon) {
  const tleRes = await fetch(
    'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE',
    { cf: { cacheTtl: 1800, cacheEverything: true } },
  )
  if (!tleRes.ok) throw new Error('TLE fetch failed')
  const tleText = await tleRes.text()
  const elems = parseTleMeanMotion(tleText)

  const now = Date.now()
  const step = 30 * 1000
  const end = now + 36 * 3600 * 1000
  const minEl = 20
  const samples = []
  for (let t = now; t <= end; t += step) {
    const p = satLatLon(elems, t)
    const { el, az } = elevationAzimuth(lat, lon, p.lat, p.lon, p.altKm)
    samples.push({ t, el, az })
  }

  const passes = []
  let inPass = false
  let rise = null
  let maxEl = -99
  let maxT = null
  let maxAz = 0
  for (const s of samples) {
    if (s.el >= minEl) {
      if (!inPass) {
        inPass = true
        rise = s.t
        maxEl = s.el
        maxT = s.t
        maxAz = s.az
      } else if (s.el > maxEl) {
        maxEl = s.el
        maxT = s.t
        maxAz = s.az
      }
    } else if (inPass) {
      inPass = false
      // Only night-ish rough: skip if sun would be high — client can filter
      if (rise && maxT && maxEl >= minEl) {
        passes.push({
          riseMs: rise,
          maxMs: maxT,
          setMs: s.t,
          maxEl: Math.round(maxEl),
          direction: cardinal(maxAz),
        })
      }
      rise = null
      maxEl = -99
    }
  }
  return passes.slice(0, 6)
}
