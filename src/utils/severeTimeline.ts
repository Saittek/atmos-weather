import type { AirQualityData, PressureLevelProfile, WeatherAlert, WeatherData } from '../api/types'
import type { Units } from './format'
import {
  convertTemp,
  formatHour,
  formatSpeed,
  formatTemp,
  hasPrecipMm,
  parseWeatherLocal,
} from './format'
import { todayDailyIndex } from './weatherStory'
import { filterActiveAlerts } from './activeAlerts'

export type RiskLevel = 'info' | 'watch' | 'warn'

export interface TimelineEvent {
  id: string
  when: string
  title: string
  detail: string
  level: RiskLevel
  ms: number
}

/** Build “what matters next” events for the next ~24h */
export function buildSevereTimeline(
  weather: WeatherData,
  units: Units,
  alerts: WeatherAlert[],
  air: AirQualityData | null,
  profile: PressureLevelProfile | null,
): TimelineEvent[] {
  const events: TimelineEvent[] = []
  const tz = weather.timezone
  const now = Date.now()
  const horizon = now + 24 * 3600_000
  const h = weather.hourly
  const ti = todayDailyIndex(weather)

  // Active / upcoming official alerts only
  for (const a of filterActiveAlerts(alerts).slice(0, 4)) {
    const sev = a.severity.toLowerCase()
    const level: RiskLevel =
      sev === 'extreme' || sev === 'severe' ? 'warn' : sev === 'moderate' ? 'watch' : 'info'
    const onset = a.onset ? Date.parse(a.onset) : now
    const ms = Number.isFinite(onset) ? onset : now
    events.push({
      id: `alert-${a.id}`,
      when: ms <= now ? 'Now' : formatHour(a.onset ?? weather.current.time, tz),
      title: a.event,
      detail: a.headline.slice(0, 120),
      level,
      ms: Math.max(ms, now),
    })
  }

  // Peak precip hour next 24h
  let peakPrecip = 0
  let peakPrecipI = -1
  let peakGust = 0
  let peakGustI = -1
  let peakUv = 0
  let peakUvI = -1
  let freezeI = -1
  let heatI = -1
  let wetStartI = -1

  for (let i = 0; i < h.time.length; i++) {
    const ms = parseWeatherLocal(h.time[i], tz)
    if (ms < now - 30 * 60_000 || ms > horizon) continue
    const p = h.precipitation[i] ?? 0
    const g = h.wind_gusts_10m[i] ?? 0
    const uv = h.uv_index[i] ?? 0
    const t = h.temperature_2m[i]
    if (p > peakPrecip) {
      peakPrecip = p
      peakPrecipI = i
    }
    if (g > peakGust) {
      peakGust = g
      peakGustI = i
    }
    if (uv > peakUv) {
      peakUv = uv
      peakUvI = i
    }
    if (freezeI < 0 && t != null && t <= 0) freezeI = i
    if (heatI < 0 && t != null && t >= 32) heatI = i
    if (wetStartI < 0 && hasPrecipMm(p)) wetStartI = i
  }

  if (wetStartI >= 0) {
    const ms = parseWeatherLocal(h.time[wetStartI], tz)
    const mins = Math.round((ms - now) / 60000)
    events.push({
      id: 'wet-start',
      when: mins <= 15 ? 'Soon' : formatHour(h.time[wetStartI], tz),
      title: mins <= 15 ? 'Precipitation starting' : 'Next wet period',
      detail:
        mins <= 15
          ? 'Rain or snow in the next ~15 minutes'
          : `Precip expected around ${formatHour(h.time[wetStartI], tz)}`,
      level: mins <= 45 ? 'watch' : 'info',
      ms,
    })
  }

  if (peakPrecipI >= 0 && peakPrecip >= 0.5) {
    events.push({
      id: 'peak-precip',
      when: formatHour(h.time[peakPrecipI], tz),
      title: 'Heaviest precip',
      detail: `Up to ~${peakPrecip.toFixed(1)} mm/hr around ${formatHour(h.time[peakPrecipI], tz)}`,
      level: peakPrecip >= 5 ? 'warn' : peakPrecip >= 1.5 ? 'watch' : 'info',
      ms: parseWeatherLocal(h.time[peakPrecipI], tz),
    })
  }

  if (peakGustI >= 0 && peakGust >= 40) {
    events.push({
      id: 'peak-gust',
      when: formatHour(h.time[peakGustI], tz),
      title: 'Peak wind gusts',
      detail: `${formatSpeed(peakGust, units)} around ${formatHour(h.time[peakGustI], tz)}`,
      level: peakGust >= 70 ? 'warn' : peakGust >= 50 ? 'watch' : 'info',
      ms: parseWeatherLocal(h.time[peakGustI], tz),
    })
  }

  if (peakUvI >= 0 && peakUv >= 6) {
    events.push({
      id: 'peak-uv',
      when: formatHour(h.time[peakUvI], tz),
      title: 'High UV window',
      detail: `UV peaks near ${peakUv.toFixed(0)} — sun protection midday`,
      level: peakUv >= 8 ? 'watch' : 'info',
      ms: parseWeatherLocal(h.time[peakUvI], tz),
    })
  }

  if (freezeI >= 0) {
    events.push({
      id: 'freeze',
      when: formatHour(h.time[freezeI], tz),
      title: 'Freezing temperatures',
      detail: `At or below ${formatTemp(0, units)} around ${formatHour(h.time[freezeI], tz)}`,
      level: 'watch',
      ms: parseWeatherLocal(h.time[freezeI], tz),
    })
  }

  if (heatI >= 0) {
    events.push({
      id: 'heat',
      when: formatHour(h.time[heatI], tz),
      title: 'Hot stretch',
      detail: `Temps near ${formatTemp(h.temperature_2m[heatI], units)} — hydrate & shade`,
      level: 'watch',
      ms: parseWeatherLocal(h.time[heatI], tz),
    })
  }

  // Daily extremes today
  const hi = weather.daily.temperature_2m_max[ti]
  const lo = weather.daily.temperature_2m_min[ti]
  if (hi != null) {
    events.push({
      id: 'today-range',
      when: 'Today',
      title: 'Today’s range',
      detail: `High ${formatTemp(hi, units)} · Low ${formatTemp(lo, units)} · wind max ${formatSpeed(weather.daily.wind_speed_10m_max[ti] ?? 0, units)}`,
      level: 'info',
      ms: now + 1,
    })
  }

  // AQI
  const aqi = air?.current?.us_aqi
  if (aqi != null && aqi >= 100) {
    events.push({
      id: 'aqi',
      when: 'Now',
      title: aqi >= 150 ? 'Unhealthy air quality' : 'Elevated AQI',
      detail: `US AQI ${aqi} — sensitive groups should limit outdoor time`,
      level: aqi >= 150 ? 'warn' : 'watch',
      ms: now,
    })
  }

  // Storm proxy from CAPE-like instability: large mid-level lapse via profile
  if (profile?.temperature?.length) {
    const t850 = profile.temperature[profile.levels.indexOf(850)]
    const t500 = profile.temperature[profile.levels.indexOf(500)]
    if (t850 != null && t500 != null) {
      const lapse = t850 - t500
      if (lapse >= 28) {
        events.push({
          id: 'storm-proxy',
          when: 'Today',
          title: 'Unstable atmosphere',
          detail: `Strong mid-level lapse (~${lapse.toFixed(0)}°C 850–500 hPa) — storm chances higher if moisture arrives`,
          level: lapse >= 32 ? 'watch' : 'info',
          ms: now + 2,
        })
      }
    }
  }

  // Sort by time, cap list
  events.sort((a, b) => a.ms - b.ms)
  const seen = new Set<string>()
  const unique: TimelineEvent[] = []
  for (const e of events) {
    if (seen.has(e.id)) continue
    seen.add(e.id)
    unique.push(e)
    if (unique.length >= 8) break
  }
  return unique
}

export function vsNormalLine(
  todayHiC: number,
  normalHiC: number | null | undefined,
  units: Units,
): string | null {
  if (normalHiC == null) return null
  const diff = Math.round(convertTemp(todayHiC, units) - convertTemp(normalHiC, units))
  if (Math.abs(diff) < 2) return 'Near normal for this date'
  if (diff > 0) return `${diff}° warmer than typical`
  return `${Math.abs(diff)}° cooler than typical`
}

export function stormRiskScore(
  weather: WeatherData,
  profile: PressureLevelProfile | null,
): { score: number; label: string; detail: string } {
  let score = 0
  const c = weather.current
  const ti = todayDailyIndex(weather)
  const gust = weather.daily.wind_gusts_10m_max[ti] ?? c.wind_gusts_10m
  const pop = weather.daily.precipitation_probability_max[ti] ?? 0
  if (gust >= 50) score += 2
  else if (gust >= 35) score += 1
  if (pop >= 60) score += 2
  else if (pop >= 40) score += 1
  if ([95, 96, 99].includes(c.weather_code)) score += 3
  if (profile?.temperature?.length) {
    const t850 = profile.temperature[profile.levels.indexOf(850)]
    const t500 = profile.temperature[profile.levels.indexOf(500)]
    if (t850 != null && t500 != null && t850 - t500 >= 30) score += 2
  }
  const label =
    score >= 6 ? 'Elevated' : score >= 3 ? 'Moderate' : score >= 1 ? 'Slight' : 'Low'
  const detail =
    score >= 6
      ? 'Conditions favor stronger storms if triggers fire — watch radar & alerts'
      : score >= 3
        ? 'Some storm ingredients present — check afternoon updates'
        : 'No strong storm signal from current fields'
  return { score, label, detail }
}
