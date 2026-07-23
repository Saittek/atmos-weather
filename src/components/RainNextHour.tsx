import type { WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import {
  convertTemp,
  formatPrecipAmount,
  hasPrecipMm,
  parseWeatherLocal,
  precipUnit,
} from '../utils/format'
import { resolvePrecipKind } from '../utils/precipKind'

interface Props {
  weather: WeatherData
  units: Units
}

interface Slot {
  key: string
  label: string
  /** Liquid-equivalent precip in mm for this step */
  mm: number
  pop: number | null
  tempC: number | null
  code: number | null
  ms: number
}

function labelTime(ms: number, timezone: string, isNow: boolean): string {
  if (isNow) return 'Now'
  try {
    return new Date(ms).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
    })
  } catch {
    return new Date(ms).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })
  }
}

/** Nearest hourly PoP for a timestamp */
function popAt(weather: WeatherData, ms: number): number | null {
  const h = weather.hourly
  if (!h?.time?.length || !h.precipitation_probability?.length) return null
  const tz = weather.timezone
  let best = -1
  let bestDist = Infinity
  for (let i = 0; i < h.time.length; i++) {
    const t = parseWeatherLocal(h.time[i], tz)
    const d = Math.abs(t - ms)
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  }
  if (best < 0 || bestDist > 90 * 60 * 1000) return null
  const p = h.precipitation_probability[best]
  return p != null ? Number(p) : null
}

function buildSlots(weather: WeatherData): {
  slots: Slot[]
  source: '15-min' | 'hourly'
} {
  const tz = weather.timezone
  const now = Date.now()
  const m = weather.minutely_15
  const h = weather.hourly

  // --- Prefer 15-minute series for the next ~2 hours ---
  if (m?.time?.length && m.precipitation?.length) {
    const times = m.time.map((t) => parseWeatherLocal(t, tz))
    // Slot covering "now": start time <= now < start+15m, else next future
    let start = times.findIndex((ms) => ms + 15 * 60 * 1000 > now)
    if (start < 0) start = Math.max(0, times.length - 8)

    const slots: Slot[] = []
    for (let i = start; i < times.length && slots.length < 8; i++) {
      const raw = m.precipitation[i]
      const mm = typeof raw === 'number' ? raw : Number(raw)
      slots.push({
        key: m.time[i],
        label: labelTime(times[i], tz, slots.length === 0),
        mm: Number.isFinite(mm) ? Math.max(0, mm) : 0,
        pop: popAt(weather, times[i]),
        tempC:
          m.temperature_2m?.[i] != null ? Number(m.temperature_2m[i]) : null,
        code: m.weather_code?.[i] != null ? Number(m.weather_code[i]) : null,
        ms: times[i],
      })
    }
    if (slots.length) return { slots, source: '15-min' }
  }

  // --- Hourly fallback (next 8 hours for consistent 8 columns) ---
  if (h?.time?.length && h.precipitation?.length) {
    const times = h.time.map((t) => parseWeatherLocal(t, tz))
    let start = times.findIndex((ms) => ms + 60 * 60 * 1000 > now)
    if (start < 0) start = Math.max(0, times.length - 8)

    const slots: Slot[] = []
    for (let i = start; i < times.length && slots.length < 8; i++) {
      // Open-Meteo `precipitation` is liquid-equivalent mm for the hour
      const precip = Number(h.precipitation[i] ?? 0)
      const mm = Number.isFinite(precip) ? Math.max(0, precip) : 0
      const pop = h.precipitation_probability?.[i]
      slots.push({
        key: h.time[i],
        label: labelTime(times[i], tz, slots.length === 0),
        mm,
        pop: pop != null ? Number(pop) : null,
        tempC:
          h.temperature_2m?.[i] != null ? Number(h.temperature_2m[i]) : null,
        code: h.weather_code?.[i] != null ? Number(h.weather_code[i]) : null,
        ms: times[i],
      })
    }
    if (slots.length) return { slots, source: 'hourly' }
  }

  return { slots: [], source: 'hourly' }
}

export function RainNextHour({ weather, units }: Props) {
  const { slots, source } = buildSlots(weather)
  // Always judge wetness from API mm — not converted inches (that was zeroing light rain)
  const mms = slots.map((s) => s.mm)
  const maxMm = Math.max(...mms, 0)
  // Bar scale: use real max, with a gentle floor so light rain is visible
  const scaleMm = Math.max(maxMm, source === '15-min' ? 0.4 : 1.0)
  const anyRain = mms.some((mm) => hasPrecipMm(mm))
  const peak = maxMm
  const nextWet = mms.findIndex((mm) => hasPrecipMm(mm))

  const h = weather.hourly
  const now = Date.now()
  let nearPop = 0
  if (h?.time?.length && h.precipitation_probability?.length) {
    const idx = h.time
      .map((t) => parseWeatherLocal(t, weather.timezone))
      .findIndex((ms) => ms + 60 * 60 * 1000 > now)
    const i = idx < 0 ? 0 : idx
    nearPop = Number(h.precipitation_probability[i] ?? 0)
  }

  const wetTemps = slots
    .filter((s) => hasPrecipMm(s.mm))
    .map((s) => s.tempC)
    .filter((t): t is number => t != null)
  const coldestWet = wetTemps.length ? Math.min(...wetTemps) : null
  const mostlySnow =
    anyRain &&
    slots.some(
      (s) => hasPrecipMm(s.mm) && resolvePrecipKind(s.tempC, s.code, true) === 'snow',
    )
  const wintery = mostlySnow || (coldestWet != null && coldestWet <= 1)

  let headline = wintery
    ? 'No snow expected in the next couple of hours'
    : 'No rain expected in the next couple of hours'
  if (anyRain && nextWet === 0)
    headline = wintery
      ? 'Snow or wintry precip falling now'
      : 'Precipitation falling now'
  else if (anyRain && nextWet > 0)
    headline = wintery
      ? `Snow picks up around ${slots[nextWet]?.label ?? 'later'}`
      : `Rain picks up around ${slots[nextWet]?.label ?? 'later'}`
  else if (nearPop >= 40)
    headline = `${nearPop}% chance of showers nearby — keep an eye on radar`
  else if (nearPop >= 20)
    headline = `Mostly dry · ${nearPop}% chance of a light shower`

  if (!slots.length) {
    return (
      <section className="panel rain-hour-panel">
        <div className="panel-header">
          <h2>☔ Next ~2 hours</h2>
        </div>
        <p className="muted-center">
          Short-range precipitation timeline isn&apos;t available for this location
          right now.
        </p>
      </section>
    )
  }

  const stepLabel = source === '15-min' ? 'per 15 min' : 'per hour'

  return (
    <section className={`panel rain-hour-panel ${wintery ? 'is-winter' : ''}`}>
      <div className="panel-header">
        <h2>{wintery ? '❄️ Next ~2 hours' : '☔ Next ~2 hours'}</h2>
        <span className="panel-hint">
          {source === '15-min' ? '15-min steps' : 'Hourly'} · {precipUnit(units)}{' '}
          {stepLabel}
        </span>
      </div>
      <p className="rain-headline">{headline}</p>

      <div className="rain-hour-bars" role="list" aria-label="Precipitation timeline">
        {slots.map((slot) => {
          const wet = hasPrecipMm(slot.mm)
          // Compact bars: track is ~44px tall
          const hgt = wet
            ? Math.max(10, Math.round((slot.mm / scaleMm) * 38))
            : 5
          const kind = resolvePrecipKind(slot.tempC, slot.code, wet)
          const amt = formatPrecipAmount(slot.mm, units)
          const tempLabel =
            slot.tempC != null
              ? `${Math.round(convertTemp(slot.tempC, units))}°`
              : null

          return (
            <div
              className={`rain-hour-col ${wet ? 'is-wet' : 'is-dry'} kind-${kind}`}
              key={slot.key}
              role="listitem"
              title={`${slot.label}: ${amt} ${precipUnit(units)} ${stepLabel}${
                slot.pop != null ? ` · ${slot.pop}% chance` : ''
              }${tempLabel ? ` · ${tempLabel}` : ''}${
                kind === 'snow' ? ' · snow' : kind === 'mix' ? ' · mix' : ''
              }`}
            >
              <div className="rain-hour-track">
                <div
                  className={`rain-hour-fill ${wet ? 'wet' : 'dry'} fill-${kind}`}
                  style={{ height: `${hgt}px` }}
                />
              </div>
              <span className={`rain-hour-amt ${wet ? 'wet' : ''} ${kind}`}>
                {wet ? amt : '·'}
              </span>
              <span className="rain-hour-lab">{slot.label}</span>
            </div>
          )
        })}
      </div>

      <div className="rain-footer">
        <span className="rain-legend">
          <i className="rain-legend-swatch dry" /> Dry
          <i className="rain-legend-swatch wet" /> {wintery ? 'Snow / rain' : 'Rain'}
        </span>
        {anyRain ? (
          <span className="rain-peak">
            Peak {formatPrecipAmount(peak, units)} {precipUnit(units)} {stepLabel}
          </span>
        ) : (
          <span className="rain-peak muted">Timeline looks dry</span>
        )}
      </div>
    </section>
  )
}
