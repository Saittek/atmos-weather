/**
 * Google Maps Platform Weather API (WeatherNext 3) → Solara WeatherData.
 * Key stays on the Worker (`GOOGLE_WEATHER_API_KEY` or `GOOGLE_MAPS_API_KEY`).
 *
 * Always requests METRIC. Solara stores forecasts in Open-Meteo SI units
 * (°C, km/h, mm, metres); the client converts for imperial display.
 */

const GOOGLE_WEATHER = 'https://weather.googleapis.com'

/** @param {Record<string, unknown>} env */
export function googleWeatherApiKey(env) {
  const a = typeof env?.GOOGLE_WEATHER_API_KEY === 'string' ? env.GOOGLE_WEATHER_API_KEY.trim() : ''
  if (a) return a
  const b = typeof env?.GOOGLE_MAPS_API_KEY === 'string' ? env.GOOGLE_MAPS_API_KEY.trim() : ''
  return b || ''
}

/** Google WeatherCondition.Type → WMO code used by Solara / Open-Meteo UI. */
export const GOOGLE_CONDITION_TO_WMO = {
  TYPE_UNSPECIFIED: 0,
  CLEAR: 0,
  MOSTLY_CLEAR: 1,
  PARTLY_CLOUDY: 2,
  MOSTLY_CLOUDY: 3,
  CLOUDY: 3,
  WINDY: 1,
  WIND_AND_RAIN: 63,
  LIGHT_RAIN_SHOWERS: 80,
  CHANCE_OF_SHOWERS: 80,
  SCATTERED_SHOWERS: 80,
  RAIN_SHOWERS: 81,
  HEAVY_RAIN_SHOWERS: 82,
  LIGHT_TO_MODERATE_RAIN: 61,
  MODERATE_TO_HEAVY_RAIN: 63,
  RAIN: 63,
  LIGHT_RAIN: 61,
  HEAVY_RAIN: 65,
  RAIN_PERIODICALLY_HEAVY: 65,
  LIGHT_SNOW_SHOWERS: 85,
  CHANCE_OF_SNOW_SHOWERS: 85,
  SCATTERED_SNOW_SHOWERS: 85,
  SNOW_SHOWERS: 85,
  HEAVY_SNOW_SHOWERS: 86,
  LIGHT_TO_MODERATE_SNOW: 71,
  MODERATE_TO_HEAVY_SNOW: 73,
  SNOW: 73,
  LIGHT_SNOW: 71,
  HEAVY_SNOW: 75,
  SNOWSTORM: 75,
  SNOW_PERIODICALLY_HEAVY: 75,
  HEAVY_SNOW_STORM: 75,
  BLOWING_SNOW: 75,
  RAIN_AND_SNOW: 71,
  HAIL: 96,
  HAIL_SHOWERS: 96,
  THUNDERSTORM: 95,
  THUNDERSHOWER: 95,
  LIGHT_THUNDERSTORM_RAIN: 95,
  SCATTERED_THUNDERSTORMS: 95,
  HEAVY_THUNDERSTORM: 99,
}

const SHOWER_TYPES = new Set([
  'LIGHT_RAIN_SHOWERS',
  'CHANCE_OF_SHOWERS',
  'SCATTERED_SHOWERS',
  'RAIN_SHOWERS',
  'HEAVY_RAIN_SHOWERS',
  'WIND_AND_RAIN',
  'THUNDERSHOWER',
  'SCATTERED_THUNDERSTORMS',
])

const SNOW_TYPES = new Set([
  'LIGHT_SNOW_SHOWERS',
  'CHANCE_OF_SNOW_SHOWERS',
  'SCATTERED_SNOW_SHOWERS',
  'SNOW_SHOWERS',
  'HEAVY_SNOW_SHOWERS',
  'LIGHT_TO_MODERATE_SNOW',
  'MODERATE_TO_HEAVY_SNOW',
  'SNOW',
  'LIGHT_SNOW',
  'HEAVY_SNOW',
  'SNOWSTORM',
  'SNOW_PERIODICALLY_HEAVY',
  'HEAVY_SNOW_STORM',
  'BLOWING_SNOW',
])

export function googleConditionToWmo(type) {
  if (type == null) return 0
  const key = String(type).toUpperCase().replace(/^TYPE\./, '')
  if (Object.prototype.hasOwnProperty.call(GOOGLE_CONDITION_TO_WMO, key)) {
    return GOOGLE_CONDITION_TO_WMO[key]
  }
  return 0
}

function num(v, fallback = 0) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

function conditionType(obj) {
  return obj?.weatherCondition?.type ?? obj?.type ?? ''
}

/** Temperature → °C (defensive if Google ever returns Fahrenheit). */
export function tempC(t) {
  if (t == null) return 0
  if (typeof t === 'number') return t
  const deg = num(t.degrees, NaN)
  if (!Number.isFinite(deg)) return 0
  const unit = String(t.unit || '').toUpperCase()
  if (unit === 'FAHRENHEIT') return ((deg - 32) * 5) / 9
  return deg
}

/** Wind → km/h */
export function speedKmh(w) {
  if (w == null) return 0
  if (typeof w === 'number') return w
  const v = num(w.value, NaN)
  if (!Number.isFinite(v)) return 0
  const unit = String(w.unit || '').toUpperCase()
  if (unit === 'MILES_PER_HOUR') return v / 0.621371
  return v
}

/** QPF → millimetres */
export function qpfMm(q) {
  if (q == null) return 0
  if (typeof q === 'number') return q
  const v = num(q.quantity, NaN)
  if (!Number.isFinite(v)) return 0
  const unit = String(q.unit || '').toUpperCase()
  if (unit === 'INCHES') return v * 25.4
  return v
}

/** Visibility → metres */
export function visibilityM(vis) {
  if (vis == null) return 10000
  if (typeof vis === 'number') return vis > 200 ? vis : vis * 1000
  const d = num(vis.distance, NaN)
  if (!Number.isFinite(d)) return 10000
  const unit = String(vis.unit || '').toUpperCase()
  if (unit === 'MILES') return d * 1609.344
  if (unit === 'KILOMETERS' || unit === 'KILOMETRES') return d * 1000
  return d > 200 ? d : d * 1000
}

function precipProb(p) {
  return num(p?.probability?.percent ?? p?.probability, 0)
}

function precipKind(p, type) {
  const rainMm = qpfMm(p?.qpf)
  const snowSwe = qpfMm(p?.snowQpf)
  const listed = String(p?.probability?.type || '').toUpperCase()
  const cond = String(type || '').toUpperCase()
  const isSnow =
    listed === 'SNOW' ||
    listed === 'RAIN_AND_SNOW' ||
    SNOW_TYPES.has(cond) ||
    cond === 'RAIN_AND_SNOW'
  const isShower = SHOWER_TYPES.has(cond)
  // Open-Meteo snowfall is centimetres; 1 mm SWE ≈ 1 cm snow
  const snowfall = isSnow || snowSwe > 0 ? snowSwe || rainMm : 0
  const liquid = rainMm
  const rain = !isSnow && !isShower ? liquid : 0
  const showers = !isSnow && isShower ? liquid : 0
  return {
    precipitation: liquid + snowSwe,
    rain,
    showers,
    snowfall,
    probability: precipProb(p),
  }
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

function fmtDate(y, m, d) {
  return `${y}-${pad2(m)}-${pad2(d)}`
}

function fmtDateTime(y, m, d, h, mi = 0) {
  return `${fmtDate(y, m, d)}T${pad2(h)}:${pad2(mi)}`
}

function displayDateTimeLocal(dt) {
  if (!dt || dt.year == null || dt.month == null || dt.day == null) return null
  return fmtDateTime(dt.year, dt.month, dt.day, dt.hours ?? dt.hour ?? 0, dt.minutes ?? 0)
}

function displayDateLocal(d) {
  if (!d || d.year == null || d.month == null || d.day == null) return null
  return fmtDate(d.year, d.month, d.day)
}

function toLocalIso(rfc3339, timeZone) {
  if (!rfc3339) return ''
  const date = new Date(rfc3339)
  if (Number.isNaN(date.getTime())) return String(rfc3339)
  if (!timeZone) return date.toISOString().slice(0, 16)
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date)
    const get = (type) => parts.find((p) => p.type === type)?.value || '00'
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
  } catch {
    return date.toISOString().slice(0, 16)
  }
}

function tzAbbr(timeZone) {
  if (!timeZone) return ''
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'short',
    }).formatToParts(new Date())
    return parts.find((p) => p.type === 'timeZoneName')?.value || ''
  } catch {
    return ''
  }
}

function windFrom(obj) {
  const w = obj?.wind || {}
  return {
    speed: speedKmh(w.speed),
    gust: speedKmh(w.gust ?? w.speed),
    dir: num(w.direction?.degrees, 0),
  }
}

function pressureHpa(obj) {
  return num(obj?.airPressure?.meanSeaLevelMillibars, 1013.25)
}

/**
 * Map Google current + hourly + daily payloads into Solara's WeatherData.
 * Throws if required series are missing.
 */
export function mapGoogleToWeatherData(current, hourly, daily, lat, lon) {
  if (!current || typeof current !== 'object') throw new Error('Google current missing')
  const hours = Array.isArray(hourly?.forecastHours) ? hourly.forecastHours : []
  const days = Array.isArray(daily?.forecastDays) ? daily.forecastDays : []
  if (!hours.length) throw new Error('Google hourly missing')
  if (!days.length) throw new Error('Google daily missing')

  const timeZone =
    current.timeZone?.id || hourly.timeZone?.id || daily.timeZone?.id || 'UTC'

  const curType = conditionType(current)
  const curPrecip = precipKind(current.precipitation, curType)
  const curWind = windFrom(current)
  const currentTime = toLocalIso(current.currentTime, timeZone) || new Date().toISOString().slice(0, 16)

  const mappedCurrent = {
    time: currentTime,
    temperature_2m: tempC(current.temperature),
    relative_humidity_2m: num(current.relativeHumidity, 0),
    apparent_temperature: tempC(current.feelsLikeTemperature ?? current.temperature),
    is_day: current.isDaytime === false ? 0 : 1,
    precipitation: curPrecip.precipitation,
    rain: curPrecip.rain,
    showers: curPrecip.showers,
    snowfall: curPrecip.snowfall,
    weather_code: googleConditionToWmo(curType),
    cloud_cover: num(current.cloudCover, 0),
    pressure_msl: pressureHpa(current),
    surface_pressure: pressureHpa(current),
    wind_speed_10m: curWind.speed,
    wind_direction_10m: curWind.dir,
    wind_gusts_10m: curWind.gust,
  }

  const h = {
    time: [],
    temperature_2m: [],
    relative_humidity_2m: [],
    dew_point_2m: [],
    apparent_temperature: [],
    precipitation_probability: [],
    precipitation: [],
    rain: [],
    showers: [],
    snowfall: [],
    weather_code: [],
    pressure_msl: [],
    cloud_cover: [],
    visibility: [],
    wind_speed_10m: [],
    wind_direction_10m: [],
    wind_gusts_10m: [],
    uv_index: [],
    is_day: [],
  }

  for (const hour of hours) {
    if (!hour) continue
    const t =
      displayDateTimeLocal(hour.displayDateTime) ||
      toLocalIso(hour.interval?.startTime, timeZone)
    if (!t) continue
    const type = conditionType(hour)
    const p = precipKind(hour.precipitation, type)
    const w = windFrom(hour)
    h.time.push(t)
    h.temperature_2m.push(tempC(hour.temperature))
    h.relative_humidity_2m.push(num(hour.relativeHumidity, 0))
    h.dew_point_2m.push(tempC(hour.dewPoint ?? hour.temperature))
    h.apparent_temperature.push(tempC(hour.feelsLikeTemperature ?? hour.temperature))
    h.precipitation_probability.push(p.probability)
    h.precipitation.push(p.precipitation)
    h.rain.push(p.rain)
    h.showers.push(p.showers)
    h.snowfall.push(p.snowfall)
    h.weather_code.push(googleConditionToWmo(type))
    h.pressure_msl.push(pressureHpa(hour))
    h.cloud_cover.push(num(hour.cloudCover, 0))
    h.visibility.push(visibilityM(hour.visibility))
    h.wind_speed_10m.push(w.speed)
    h.wind_direction_10m.push(w.dir)
    h.wind_gusts_10m.push(w.gust)
    h.uv_index.push(num(hour.uvIndex, 0))
    h.is_day.push(hour.isDaytime === false ? 0 : 1)
  }

  if (!h.time.length) throw new Error('Google hourly unmapped')

  const d = {
    time: [],
    weather_code: [],
    temperature_2m_max: [],
    temperature_2m_min: [],
    apparent_temperature_max: [],
    apparent_temperature_min: [],
    sunrise: [],
    sunset: [],
    daylight_duration: [],
    sunshine_duration: [],
    uv_index_max: [],
    precipitation_sum: [],
    rain_sum: [],
    showers_sum: [],
    snowfall_sum: [],
    precipitation_hours: [],
    precipitation_probability_max: [],
    wind_speed_10m_max: [],
    wind_gusts_10m_max: [],
    wind_direction_10m_dominant: [],
  }

  for (const day of days) {
    if (!day) continue
    const date =
      displayDateLocal(day.displayDate) ||
      (day.interval?.startTime ? toLocalIso(day.interval.startTime, timeZone).slice(0, 10) : null)
    if (!date) continue
    const dayPart = day.daytimeForecast || {}
    const nightPart = day.nighttimeForecast || {}
    const dayType = conditionType(dayPart) || conditionType(nightPart)
    const dayP = precipKind(dayPart.precipitation, conditionType(dayPart))
    const nightP = precipKind(nightPart.precipitation, conditionType(nightPart))
    const dayW = windFrom(dayPart)
    const nightW = windFrom(nightPart)
    const sunrise = toLocalIso(day.sunEvents?.sunriseTime, timeZone)
    const sunset = toLocalIso(day.sunEvents?.sunsetTime, timeZone)
    let daylight = 0
    if (sunrise && sunset) {
      const a = Date.parse(day.sunEvents?.sunriseTime || sunrise)
      const b = Date.parse(day.sunEvents?.sunsetTime || sunset)
      if (Number.isFinite(a) && Number.isFinite(b) && b > a) daylight = (b - a) / 1000
    }
    const cloud = num(dayPart.cloudCover, num(nightPart.cloudCover, 50))
    const sunshine = daylight > 0 ? daylight * Math.max(0, 1 - cloud / 100) : 0

    let precipHours = 0
    for (let i = 0; i < h.time.length; i++) {
      if (!String(h.time[i]).startsWith(date)) continue
      if ((h.precipitation[i] ?? 0) >= 0.1) precipHours += 1
    }

    d.time.push(date)
    d.weather_code.push(googleConditionToWmo(dayType))
    d.temperature_2m_max.push(tempC(day.maxTemperature))
    d.temperature_2m_min.push(tempC(day.minTemperature))
    d.apparent_temperature_max.push(tempC(day.feelsLikeMaxTemperature ?? day.maxTemperature))
    d.apparent_temperature_min.push(tempC(day.feelsLikeMinTemperature ?? day.minTemperature))
    d.sunrise.push(sunrise || `${date}T06:00`)
    d.sunset.push(sunset || `${date}T18:00`)
    d.daylight_duration.push(daylight)
    d.sunshine_duration.push(sunshine)
    d.uv_index_max.push(Math.max(num(dayPart.uvIndex, 0), num(nightPart.uvIndex, 0)))
    d.precipitation_sum.push(dayP.precipitation + nightP.precipitation)
    d.rain_sum.push(dayP.rain + nightP.rain)
    d.showers_sum.push(dayP.showers + nightP.showers)
    d.snowfall_sum.push(dayP.snowfall + nightP.snowfall)
    d.precipitation_hours.push(precipHours)
    d.precipitation_probability_max.push(Math.max(dayP.probability, nightP.probability))
    d.wind_speed_10m_max.push(Math.max(dayW.speed, nightW.speed))
    d.wind_gusts_10m_max.push(Math.max(dayW.gust, nightW.gust))
    d.wind_direction_10m_dominant.push(dayW.dir || nightW.dir)
  }

  if (!d.time.length) throw new Error('Google daily unmapped')

  return {
    latitude: num(lat),
    longitude: num(lon),
    timezone: timeZone,
    timezone_abbreviation: tzAbbr(timeZone),
    elevation: 0,
    current: mappedCurrent,
    hourly: h,
    daily: d,
    current_units: {
      time: 'iso8601',
      temperature_2m: '°C',
      relative_humidity_2m: '%',
      apparent_temperature: '°C',
      is_day: '',
      precipitation: 'mm',
      rain: 'mm',
      showers: 'mm',
      snowfall: 'cm',
      weather_code: 'wmo code',
      cloud_cover: '%',
      pressure_msl: 'hPa',
      surface_pressure: 'hPa',
      wind_speed_10m: 'km/h',
      wind_direction_10m: '°',
      wind_gusts_10m: 'km/h',
    },
    solara_source: {
      strategy: 'Google WeatherNext 3',
      provider: 'google',
      longModel: 'weathernext3',
    },
  }
}

async function googleGet(path, params, apiKey) {
  const url = new URL(`${GOOGLE_WEATHER}${path}`)
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') url.searchParams.set(k, String(v))
  }
  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'X-Goog-Api-Key': apiKey,
    },
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  if (!res.ok) {
    const msg =
      json?.error?.message ||
      json?.message ||
      `Google Weather HTTP ${res.status}`
    const err = new Error(msg)
    err.status = res.status
    err.google = true
    throw err
  }
  return json
}

async function fetchHourlyPages(lat, lon, apiKey, hoursWanted) {
  const hours = Math.max(1, Math.min(240, hoursWanted))
  let pageToken = ''
  const forecastHours = []
  let timeZone = null
  let pages = 0
  while (pages < 12 && forecastHours.length < hours) {
    const params = {
      'location.latitude': lat,
      'location.longitude': lon,
      unitsSystem: 'METRIC',
      languageCode: 'en',
      hours,
      pageSize: 24,
    }
    if (pageToken) params.pageToken = pageToken
    const json = await googleGet('/v1/forecast/hours:lookup', params, apiKey)
    const batch = Array.isArray(json?.forecastHours) ? json.forecastHours : []
    forecastHours.push(...batch)
    if (!timeZone && json?.timeZone) timeZone = json.timeZone
    pageToken = json?.nextPageToken || ''
    pages += 1
    if (!pageToken || !batch.length) break
  }
  return { forecastHours, timeZone }
}

/**
 * Fetch current + hourly + daily from Google and map to WeatherData.
 * @returns {Promise<object>}
 */
export async function fetchGoogleWeatherMapped(env, { lat, lon, lite = false }) {
  const apiKey = googleWeatherApiKey(env)
  if (!apiKey) {
    const err = new Error('Google Weather not configured')
    err.status = 503
    err.unconfigured = true
    throw err
  }

  const hoursWanted = lite ? 72 : 120
  const loc = {
    'location.latitude': lat,
    'location.longitude': lon,
    unitsSystem: 'METRIC',
    languageCode: 'en',
  }

  const [current, hourly, daily] = await Promise.all([
    googleGet('/v1/currentConditions:lookup', loc, apiKey),
    fetchHourlyPages(lat, lon, apiKey, hoursWanted),
    googleGet('/v1/forecast/days:lookup', { ...loc, days: 10, pageSize: 10 }, apiKey),
  ])

  return mapGoogleToWeatherData(current, hourly, daily, lat, lon)
}
