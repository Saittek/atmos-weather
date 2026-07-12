export type Units = 'metric' | 'imperial'

export function convertTemp(celsius: number, units: Units): number {
  return units === 'metric' ? celsius : (celsius * 9) / 5 + 32
}

export function convertSpeed(kmh: number, units: Units): number {
  return units === 'metric' ? kmh : kmh * 0.621371
}

export function convertDistance(meters: number, units: Units): number {
  return units === 'metric' ? meters / 1000 : meters / 1609.344
}

export function convertPrecip(mm: number, units: Units): number {
  return units === 'metric' ? mm : mm / 25.4
}

export function tempUnit(units: Units): string {
  return units === 'metric' ? '°C' : '°F'
}

export function speedUnit(units: Units): string {
  return units === 'metric' ? 'km/h' : 'mph'
}

export function distanceUnit(units: Units): string {
  return units === 'metric' ? 'km' : 'mi'
}

export function precipUnit(units: Units): string {
  return units === 'metric' ? 'mm' : 'in'
}

export function formatTemp(celsius: number, units: Units, decimals = 0): string {
  return `${Math.round(convertTemp(celsius, units) * 10 ** decimals) / 10 ** decimals}°`
}

export function formatSpeed(kmh: number, units: Units): string {
  return `${Math.round(convertSpeed(kmh, units))} ${speedUnit(units)}`
}

export function formatDistance(meters: number, units: Units): string {
  const v = convertDistance(meters, units)
  return `${v >= 10 ? Math.round(v) : v.toFixed(1)} ${distanceUnit(units)}`
}

export function formatPrecip(mm: number, units: Units): string {
  const v = convertPrecip(mm, units)
  if (v === 0) return `0 ${precipUnit(units)}`
  return `${units === 'metric' ? v.toFixed(1) : v.toFixed(2)} ${precipUnit(units)}`
}

export function formatPressure(hpa: number, units: Units): string {
  if (units === 'metric') return `${Math.round(hpa)} hPa`
  return `${(hpa * 0.02953).toFixed(2)} inHg`
}

function toMs(iso: string, timezone?: string): number {
  // Open-Meteo wall-clock strings need timezone-aware parse when TZ is known
  if (timezone && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso)) {
    return parseWeatherLocal(iso, timezone)
  }
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? parseWeatherLocal(iso, timezone) : t
}

export function formatTime(iso: string, timezone?: string): string {
  try {
    return new Date(toMs(iso, timezone)).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
    })
  } catch {
    return new Date(toMs(iso, timezone)).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })
  }
}

export function formatHour(iso: string, timezone?: string): string {
  try {
    return new Date(toMs(iso, timezone)).toLocaleTimeString(undefined, {
      hour: 'numeric',
      timeZone: timezone,
    })
  } catch {
    return new Date(toMs(iso, timezone)).toLocaleTimeString(undefined, { hour: 'numeric' })
  }
}

export function formatDay(iso: string, timezone?: string): string {
  try {
    return new Date(toMs(iso, timezone)).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: timezone,
    })
  } catch {
    return new Date(toMs(iso, timezone)).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  }
}

export function formatWeekday(iso: string, timezone?: string): string {
  try {
    return new Date(toMs(iso, timezone)).toLocaleDateString(undefined, {
      weekday: 'short',
      timeZone: timezone,
    })
  } catch {
    return new Date(toMs(iso, timezone)).toLocaleDateString(undefined, { weekday: 'short' })
  }
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

export function formatRadarTime(unix: number): string {
  return new Date(unix * 1000).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * Parse Open-Meteo wall-clock strings (e.g. "2026-07-11T21:15") as time
 * in a specific IANA timezone, returning UTC milliseconds.
 */
export function parseWeatherLocal(isoLocal: string, timeZone?: string): number {
  const m = isoLocal.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/,
  )
  if (!m) {
    const t = new Date(isoLocal).getTime()
    return Number.isNaN(t) ? Date.now() : t
  }

  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const h = Number(m[4])
  const mi = Number(m[5])
  const s = Number(m[6] ?? 0)

  if (!timeZone) {
    // Browser local wall clock
    return new Date(y, mo - 1, d, h, mi, s).getTime()
  }

  // Find UTC instant whose wall time in `timeZone` matches y-mo-d h:mi:s
  let utc = Date.UTC(y, mo - 1, d, h, mi, s)
  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(utc))

    const get = (type: string) =>
      Number(parts.find((p) => p.type === type)?.value ?? '0')

    let hour = get('hour')
    // Some engines emit 24:00 for midnight
    if (hour === 24) hour = 0

    const asIfUtc = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      hour,
      get('minute'),
      get('second'),
    )
    const wanted = Date.UTC(y, mo - 1, d, h, mi, s)
    const delta = wanted - asIfUtc
    if (delta === 0) break
    utc += delta
  }
  return utc
}
