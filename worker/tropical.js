/**
 * NHC tropical cyclones + forecast track / cone geometry for the globe map.
 * Proxied server-side so the SPA avoids CORS on nhc.noaa.gov.
 */

const NHC_STORMS = 'https://www.nhc.noaa.gov/CurrentStorms.json'
const MAPSERVER =
  'https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer'

/** Layer base for AT1=4, EP1=134, CP1=264; each bin is +26 */
function layerBase(binNumber) {
  const m = String(binNumber || '').toUpperCase().match(/^(AT|EP|CP)(\d)$/)
  if (!m) return null
  const basin = m[1]
  const n = Number(m[2])
  if (n < 1 || n > 5) return null
  const start = basin === 'AT' ? 4 : basin === 'EP' ? 134 : 264
  return start + (n - 1) * 26
}

async function fetchGeoJson(layerId) {
  const url =
    `${MAPSERVER}/${layerId}/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson&resultRecordCount=200`
  const res = await fetch(url, {
    headers: { Accept: 'application/geo+json,application/json' },
  })
  if (!res.ok) return null
  return res.json()
}

function coordsFromLine(feature) {
  const g = feature?.geometry
  if (!g) return []
  if (g.type === 'LineString') return g.coordinates.map((c) => [c[0], c[1]])
  if (g.type === 'MultiLineString') {
    return g.coordinates.flat().map((c) => [c[0], c[1]])
  }
  return []
}

/** All LineString coordinate arrays from a FeatureCollection (keeps segments separate). */
function lineSegmentsFromFc(fc) {
  const segs = []
  for (const f of fc?.features ?? []) {
    const g = f?.geometry
    if (!g) continue
    if (g.type === 'LineString' && g.coordinates?.length >= 2) {
      segs.push(g.coordinates.map((c) => [c[0], c[1]]))
    } else if (g.type === 'MultiLineString') {
      for (const line of g.coordinates ?? []) {
        if (line?.length >= 2) segs.push(line.map((c) => [c[0], c[1]]))
      }
    }
  }
  return segs
}

/**
 * Chain short past-track segments into one continuous path by matching endpoints.
 * NHC MapServer often returns many 2–8 point pieces instead of a single LineString.
 */
function mergeLineSegments(segments) {
  if (!segments?.length) return []
  const remaining = segments
    .map((s) => s.map((c) => [Number(c[0]), Number(c[1])]))
    .filter((s) => s.length >= 2)
  if (!remaining.length) return []

  // Prefer longest segment as seed (usually the best continuous piece)
  remaining.sort((a, b) => b.length - a.length)
  let chain = remaining.shift()
  let guard = 0
  while (remaining.length && guard < 500) {
    guard++
    const head = chain[0]
    const tail = chain[chain.length - 1]
    let bestIdx = -1
    let bestMode = null // 'prepend' | 'append' | 'prepend-rev' | 'append-rev'
    let bestDist = 0.35 // degrees — segments farther than this are separate pieces

    for (let i = 0; i < remaining.length; i++) {
      const seg = remaining[i]
      const s0 = seg[0]
      const s1 = seg[seg.length - 1]
      const trials = [
        { mode: 'append', d: Math.hypot(tail[0] - s0[0], tail[1] - s0[1]) },
        { mode: 'append-rev', d: Math.hypot(tail[0] - s1[0], tail[1] - s1[1]) },
        { mode: 'prepend', d: Math.hypot(head[0] - s1[0], head[1] - s1[1]) },
        { mode: 'prepend-rev', d: Math.hypot(head[0] - s0[0], head[1] - s0[1]) },
      ]
      for (const t of trials) {
        if (t.d < bestDist) {
          bestDist = t.d
          bestIdx = i
          bestMode = t.mode
        }
      }
    }
    if (bestIdx < 0) break
    const seg = remaining.splice(bestIdx, 1)[0]
    if (bestMode === 'append') chain = chain.concat(seg.slice(1))
    else if (bestMode === 'append-rev') chain = chain.concat(seg.slice(0, -1).reverse())
    else if (bestMode === 'prepend') chain = seg.slice(0, -1).concat(chain)
    else if (bestMode === 'prepend-rev') chain = seg.slice(1).reverse().concat(chain)
  }

  // If leftovers remain (gaps), sort by first-lon and concatenate with gaps kept as MultiLine later
  if (remaining.length) {
    const extras = remaining.sort((a, b) => a[0][0] - b[0][0])
    return { primary: chain, extras }
  }
  return { primary: chain, extras: [] }
}

function polygonFromFeature(feature) {
  const g = feature?.geometry
  if (!g) return null
  if (g.type === 'Polygon') return g.coordinates
  if (g.type === 'MultiPolygon') return g.coordinates[0] || null
  return null
}

/** Downsample ring for lighter client rendering (globe fill can choke on 2k+ verts). */
function simplifyRing(ring, maxPts = 96) {
  if (!ring || ring.length <= maxPts) return ring
  const out = []
  const step = (ring.length - 1) / (maxPts - 1)
  for (let i = 0; i < maxPts - 1; i++) {
    const idx = Math.round(i * step)
    out.push([ring[idx][0], ring[idx][1]])
  }
  // Close ring
  const first = out[0]
  const last = ring[ring.length - 1]
  out.push([last[0], last[1]])
  if (out[out.length - 1][0] !== first[0] || out[out.length - 1][1] !== first[1]) {
    out.push([first[0], first[1]])
  }
  return out
}

function classificationLabel(code) {
  const c = String(code || '').toUpperCase()
  if (c === 'HU' || c === 'MH') return c === 'MH' ? 'Major Hurricane' : 'Hurricane'
  if (c === 'TS') return 'Tropical Storm'
  if (c === 'TD') return 'Tropical Depression'
  if (c === 'STS') return 'Subtropical Storm'
  if (c === 'PTC') return 'Potential Tropical Cyclone'
  if (c === 'DB') return 'Disturbance'
  return code || 'Tropical'
}

function movementText(dir, speed) {
  if (dir == null && speed == null) return undefined
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  let d = ''
  if (typeof dir === 'number' && Number.isFinite(dir)) {
    const i = Math.round(((dir % 360) + 360) % 360 / 22.5) % 16
    d = dirs[i]
  }
  const spd = speed != null ? `${speed} kt` : ''
  return [d, spd].filter(Boolean).join(' ') || undefined
}

/**
 * @returns {Promise<{ storms: object[], tracks: object, cones: object, updatedAt: string }>}
 */
export async function getTropicalGlobeData() {
  const res = await fetch(NHC_STORMS, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`NHC CurrentStorms failed (${res.status})`)
  const data = await res.json()
  const active = data.activeStorms ?? data.storms ?? []

  const storms = []
  const trackFeatures = []
  const pastTrackFeatures = []
  const coneFeatures = []
  const pointFeatures = []

  for (const s of active) {
    const lat = Number(s.latitudeNumeric ?? s.latitudeDecimal ?? s.lat)
    const lon = Number(s.longitudeNumeric ?? s.longitudeDecimal ?? s.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue

    const bin = s.binNumber != null ? String(s.binNumber) : undefined
    const id = String(s.id ?? bin ?? s.name)
    const name = String(s.name ?? 'Unknown')
    const classification = classificationLabel(s.classification)
    const windKt = s.intensity != null ? Number(s.intensity) : NaN
    const intensity = Number.isFinite(windKt) ? `${windKt} kt` : String(s.intensity ?? '')
    const movement = movementText(s.movementDir, s.movementSpeed)

    const storm = {
      id,
      name,
      classification,
      intensity,
      pressure: s.pressure != null ? String(s.pressure) : undefined,
      movement,
      lat,
      lon,
      binNumber: bin,
      headline: s.publicAdvisory?.url
        ? `Advisory ${s.publicAdvisory?.advNum ?? ''} · NHC`
        : undefined,
      lastUpdate: s.lastUpdate != null ? String(s.lastUpdate) : undefined,
      advisoryUrl: s.publicAdvisory?.url != null ? String(s.publicAdvisory.url) : undefined,
      track: /** @type {[number, number][]} */ ([]),
      pastTrack: /** @type {[number, number][]} */ ([]),
      forecastPoints: /** @type {{ lon: number, lat: number, label?: string, windKt?: number }[]} */ ([]),
    }

    const base = layerBase(bin)
    if (base != null) {
      const [pts, track, cone, pastTrack] = await Promise.all([
        fetchGeoJson(base + 2), // Forecast Points
        fetchGeoJson(base + 3), // Forecast Track
        fetchGeoJson(base + 4), // Forecast Cone
        fetchGeoJson(base + 8), // Past Track (observed path)
      ])

      if (track?.features?.length) {
        // Prefer longest forecast line if multiple features
        let best = []
        for (const f of track.features) {
          const line = coordsFromLine(f)
          if (line.length > best.length) best = line
        }
        if (best.length >= 2) {
          // Ensure path includes current center so track meets the storm marker
          const first = best[0]
          const last = best[best.length - 1]
          const dFirst = Math.hypot(first[0] - lon, first[1] - lat)
          const dLast = Math.hypot(last[0] - lon, last[1] - lat)
          let line = best
          if (dFirst > 0.15 && dLast > 0.15) {
            // Insert current position at the nearer end
            line = dFirst <= dLast ? [[lon, lat], ...best] : [...best, [lon, lat]]
          } else if (dFirst <= dLast && dFirst > 0.01) {
            line = [[lon, lat], ...best]
          } else if (dLast < dFirst && dLast > 0.01) {
            line = [...best, [lon, lat]]
          }
          storm.track = line
          trackFeatures.push({
            type: 'Feature',
            properties: {
              id,
              name,
              classification,
              kind: 'forecast',
            },
            geometry: {
              type: 'LineString',
              coordinates: line,
            },
          })
        }
      }

      // Observed path already taken (best/past track) — often many short segments
      if (pastTrack?.features?.length) {
        const segs = lineSegmentsFromFc(pastTrack)
        const merged = mergeLineSegments(segs)
        const primary = merged.primary || []
        const extras = merged.extras || []
        if (primary.length >= 2) {
          storm.pastTrack = primary
          pastTrackFeatures.push({
            type: 'Feature',
            properties: {
              id,
              name,
              classification,
              kind: 'past',
            },
            geometry: {
              type: 'LineString',
              coordinates: primary,
            },
          })
        }
        // Keep extra disconnected pieces as MultiLine so history isn't lost
        if (extras.length) {
          pastTrackFeatures.push({
            type: 'Feature',
            properties: {
              id,
              name,
              classification,
              kind: 'past',
            },
            geometry: {
              type: 'MultiLineString',
              coordinates: extras,
            },
          })
          // Expose full history on storm for SVG overlay
          storm.pastTrackSegments = [primary, ...extras].filter((s) => s.length >= 2)
        } else if (primary.length >= 2) {
          storm.pastTrackSegments = [primary]
        }
      }

      if (cone?.features?.[0]) {
        const poly = polygonFromFeature(cone.features[0])
        if (poly && poly[0]) {
          const ring = simplifyRing(poly[0], 100)
          const holes = poly.slice(1).map((h) => simplifyRing(h, 40))
          coneFeatures.push({
            type: 'Feature',
            properties: { id, name },
            geometry: { type: 'Polygon', coordinates: [ring, ...holes] },
          })
          storm.coneRing = ring
        }
      }

      if (pts?.features?.length) {
        for (const f of pts.features) {
          const g = f.geometry
          if (!g || g.type !== 'Point') continue
          const [plon, plat] = g.coordinates
          const p = f.properties || {}
          storm.forecastPoints.push({
            lon: plon,
            lat: plat,
            label: p.datelbl != null ? String(p.datelbl) : p.validtime != null ? String(p.validtime) : undefined,
            windKt: p.maxwind != null ? Number(p.maxwind) : undefined,
          })
          pointFeatures.push({
            type: 'Feature',
            properties: {
              id,
              name,
              label: p.datelbl || (p.tau != null ? `+${p.tau}h` : ''),
              windKt: p.maxwind,
              tau: p.tau,
            },
            geometry: { type: 'Point', coordinates: [plon, plat] },
          })
        }
      }
    }

    // Always include current center as a point
    pointFeatures.push({
      type: 'Feature',
      properties: {
        id,
        name,
        label: 'Now',
        windKt: Number.isFinite(windKt) ? windKt : undefined,
        tau: 0,
        isCenter: true,
      },
      geometry: { type: 'Point', coordinates: [lon, lat] },
    })

    storms.push(storm)
  }

  return {
    storms,
    tracks: { type: 'FeatureCollection', features: trackFeatures },
    pastTracks: { type: 'FeatureCollection', features: pastTrackFeatures },
    cones: { type: 'FeatureCollection', features: coneFeatures },
    points: { type: 'FeatureCollection', features: pointFeatures },
    updatedAt: new Date().toISOString(),
    source: 'NHC CurrentStorms + NOAA tropical MapServer',
  }
}
