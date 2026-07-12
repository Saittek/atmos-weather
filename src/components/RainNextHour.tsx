import type { WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import {
  convertPrecip,
  convertTemp,
  parseWeatherLocal,
  precipUnit,
} from '../utils/format'
import { getWeatherInfo } from '../utils/weatherCodes'

interface Props {
  weather: WeatherData
  units: Units
}

interface Slot {
  key: string
  label: string
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

function buildSlots(weather: WeatherData): { slots: Slot[]; source: '15-min' | 'hourly' } {
  const tz = weather.timezone
  const now = Date.now()
  const m = weather.minutely_15
  const h = weather.hourly

  // --- Prefer 15-minute series for the next ~2 hours ---
  if (m?.time?.length) {
    const times = m.time.map((t) => parseWeatherLocal(t, tz))
    // Start at the slot covering "now" (or the next upcoming one)
    let start = times.findIndex((ms) => ms + 15 * 60 * 1000 > now)
    if (start < 0) start = Math.max(0, times.length - 8)

    const slots: Slot[] = []
    for (let i = start; i < times.length && slots.length < 8; i++) {
      const mm = Number(m.precipitation?.[i] ?? 0)
      slots.push({
        key: m.time[i],
        label: labelTime(times[i], tz, slots.length === 0),
        mm: Number.isFinite(mm) ? mm : 0,
        pop: null,
        tempC:
          m.temperature_2m?.[i] != null ? Number(m.temperature_2m[i]) : null,
        code: m.weather_code?.[i] != null ? Number(m.weather_code[i]) : null,
        ms: times[i],
      })
    }
    if (slots.length) return { slots, source: '15-min' }
  }

  // --- Hourly fallback (next 6 hours) ---
  if (h?.time?.length) {
    const times = h.time.map((t) => parseWeatherLocal(t, tz))
    let start = times.findIndex((ms) => ms + 60 * 60 * 1000 > now)
    if (start < 0) start = Math.max(0, times.length - 6)

    const slots: Slot[] = []
    for (let i = start; i < times.length && slots.length < 6; i++) {
      const mm = Number(h.precipitation?.[i] ?? 0)
      const pop = h.precipitation_probability?.[i]
      slots.push({
        key: h.time[i],
        label: labelTime(times[i], tz, slots.length === 0),
        mm: Number.isFinite(mm) ? mm : 0,
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
  const amounts = slots.map((s) => convertPrecip(s.mm, units))
  const maxA = Math.max(...amounts, units === 'metric' ? 1 : 0.04)
  const anyRain = amounts.some((a) => a > 0.005)
  const peak = amounts.length ? Math.max(...amounts) : 0
  const nextWet = amounts.findIndex((a) => a > 0.005)

  // Also surface chance-of-precip from hourly near now for headline
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

  let headline = 'No rain expected in the next couple of hours'
  if (anyRain && nextWet === 0) headline = 'Precipitation falling now'
  else if (anyRain && nextWet > 0)
    headline = `Rain picks up around ${slots[nextWet]?.label ?? 'later'}`
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

  return (
    <section className="panel rain-hour-panel">
      <div className="panel-header">
        <h2>☔ Next ~2 hours</h2>
        <span className="panel-hint">
          {source === '15-min' ? '15-min steps' : 'Hourly'} · {precipUnit(units)}
        </span>
      </div>
      <p className="rain-headline">{headline}</p>

      <div className="rain-hour-bars" role="list" aria-label="Precipitation timeline">
        {slots.map((slot, i) => {
          const a = amounts[i]
          const wet = a > 0.005
          // Always show a visible baseline; grow with precip
          const hgt = wet
            ? Math.max(18, Math.round((a / maxA) * 78))
            : 10
          const info =
            slot.code != null
              ? getWeatherInfo(slot.code, true)
              : null
          const tempLabel =
            slot.tempC != null
              ? `${Math.round(convertTemp(slot.tempC, units))}°`
              : null

          return (
            <div
              className={`rain-hour-col ${wet ? 'is-wet' : 'is-dry'}`}
              key={slot.key}
              role="listitem"
              title={`${slot.label}: ${a.toFixed(units === 'metric' ? 1 : 2)} ${precipUnit(units)}${
                slot.pop != null ? ` · ${slot.pop}% chance` : ''
              }`}
            >
              {tempLabel && <span className="rain-hour-temp">{tempLabel}</span>}
              <span className="rain-hour-icon" aria-hidden>
                {info?.icon ?? (wet ? '🌧️' : '—')}
              </span>
              <div className="rain-hour-track">
                <div
                  className={`rain-hour-fill ${wet ? 'wet' : 'dry'}`}
                  style={{ height: `${hgt}px` }}
                />
              </div>
              <span className={`rain-hour-amt ${wet ? 'wet' : ''}`}>
                {wet
                  ? units === 'metric'
                    ? a.toFixed(1)
                    : a.toFixed(2)
                  : '0'}
              </span>
              {slot.pop != null && (
                <span className={`rain-hour-pop ${slot.pop >= 40 ? 'high' : ''}`}>
                  {slot.pop}%
                </span>
              )}
              <span className="rain-hour-lab">{slot.label}</span>
            </div>
          )
        })}
      </div>

      <div className="rain-footer">
        <span className="rain-legend">
          <i className="rain-legend-swatch dry" /> Dry
          <i className="rain-legend-swatch wet" /> Rain
        </span>
        {anyRain ? (
          <span className="rain-peak">
            Peak ~{units === 'metric' ? peak.toFixed(1) : peak.toFixed(2)}{' '}
            {precipUnit(units)}
            {source === '15-min' ? ' / 15 min' : '/hr'}
          </span>
        ) : (
          <span className="rain-peak muted">Timeline looks dry</span>
        )}
      </div>
    </section>
  )
}
