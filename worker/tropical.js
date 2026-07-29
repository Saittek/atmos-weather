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

function polygonFromFeature(feature) {
  const g = feature?.geometry
  if (!g) return null
  if (g.type === 'Polygon') return g.coordinates
  if (g.type === 'MultiPolygon') return g.coordinates[0] || null
  return null
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

      if (track?.features?.[0]) {
        const line = coordsFromLine(track.features[0])
        if (line.length >= 2) {
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

      // Observed path already taken (best/past track)
      if (pastTrack?.features?.length) {
        for (const f of pastTrack.features) {
          const line = coordsFromLine(f)
          if (line.length < 2) continue
          storm.pastTrack = line
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
              coordinates: line,
            },
          })
        }
      }

      if (cone?.features?.[0]) {
        const poly = polygonFromFeature(cone.features[0])
        if (poly) {
          coneFeatures.push({
            type: 'Feature',
            properties: { id, name },
            geometry: { type: 'Polygon', coordinates: poly },
          })
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
