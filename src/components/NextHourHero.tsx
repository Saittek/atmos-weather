/**
 * Lock-screen style “next hour” precip hero — hyperlocal minute strip.
 */
import { useMemo } from 'react'
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
  placeName?: string
  /** Compact for widget page */
  compact?: boolean
}

interface Slot {
  label: string
  mm: number
  pop: number | null
  tempC: number | null
  isNow: boolean
}

function buildNextHour(weather: WeatherData): {
  slots: Slot[]
  totalMm: number
  peakPop: number
  source: string
  wet: boolean
} {
  const tz = weather.timezone
  const now = Date.now()
  const m = weather.minutely_15
  const h = weather.hourly
  const slots: Slot[] = []

  if (m?.time?.length && m.precipitation?.length) {
    const times = m.time.map((t) => parseWeatherLocal(t, tz))
    let start = times.findIndex((ms) => ms + 15 * 60_000 > now)
    if (start < 0) start = Math.max(0, times.length - 4)
    for (let i = start; i < times.length && slots.length < 4; i++) {
      const mm = Number(m.precipitation[i]) || 0
      const label =
        slots.length === 0
          ? 'Now'
          : new Date(times[i]).toLocaleTimeString(undefined, {
              hour: 'numeric',
              minute: '2-digit',
              timeZone: tz,
            })
      let pop: number | null = null
      if (h?.time?.length) {
        let best = 0
        let bestD = Infinity
        for (let j = 0; j < h.time.length; j++) {
          const d = Math.abs(parseWeatherLocal(h.time[j], tz) - times[i])
          if (d < bestD) {
            bestD = d
            best = j
          }
        }
        if (bestD < 90 * 60_000) pop = h.precipitation_probability[best] ?? null
      }
      slots.push({
        label,
        mm: Math.max(0, mm),
        pop: pop != null ? Number(pop) : null,
        tempC: m.temperature_2m?.[i] != null ? Number(m.temperature_2m[i]) : null,
        isNow: slots.length === 0,
      })
    }
    if (slots.length) {
      const totalMm = slots.reduce((s, x) => s + x.mm, 0)
      const peakPop = Math.max(0, ...slots.map((x) => x.pop ?? 0))
      return {
        slots,
        totalMm,
        peakPop,
        source: '15-min',
        wet: totalMm >= 0.1 || peakPop >= 40,
      }
    }
  }

  if (h?.time?.length) {
    const times = h.time.map((t) => parseWeatherLocal(t, tz))
    let start = times.findIndex((ms) => ms + 60 * 60_000 > now)
    if (start < 0) start = 0
    for (let i = start; i < times.length && slots.length < 2; i++) {
      const mm = Number(h.precipitation[i]) || 0
      slots.push({
        label: slots.length === 0 ? 'This hour' : 'Next hour',
        mm: Math.max(0, mm),
        pop: h.precipitation_probability[i] != null ? Number(h.precipitation_probability[i]) : null,
        tempC: h.temperature_2m[i] != null ? Number(h.temperature_2m[i]) : null,
        isNow: slots.length === 0,
      })
    }
  }

  const totalMm = slots.reduce((s, x) => s + x.mm, 0)
  const peakPop = Math.max(0, ...slots.map((x) => x.pop ?? 0))
  return {
    slots,
    totalMm,
    peakPop,
    source: 'hourly',
    wet: totalMm >= 0.2 || peakPop >= 40,
  }
}

export function NextHourHero({ weather, units, placeName, compact }: Props) {
  const data = useMemo(() => buildNextHour(weather), [weather])
  if (!data.slots.length) return null

  const nowTempC = data.slots[0]?.tempC ?? weather.current?.temperature_2m ?? null
  const kind = resolvePrecipKind(
    nowTempC,
    weather.current?.weather_code,
    data.wet,
  )
  const unit = precipUnit(units)
  const maxMm = Math.max(0.2, ...data.slots.map((s) => s.mm), 0.01)
  const headline = data.wet
    ? data.totalMm >= 0.5
      ? kind === 'snow' || kind === 'mix'
        ? 'Snow likely in the next hour'
        : 'Rain expected soon'
      : 'Precip possible soon'
    : 'Dry for the next hour'

  const nowTemp =
    data.slots[0]?.tempC != null
      ? `${Math.round(convertTemp(data.slots[0].tempC, units))}°`
      : null

  return (
    <section
      className={`next-hour-hero ${data.wet ? 'is-wet' : 'is-dry'} ${compact ? 'is-compact' : ''}`}
      aria-label="Next hour precipitation"
    >
      <div className="nh-top">
        <div>
          <p className="nh-kicker">Next hour{placeName ? ` · ${placeName}` : ''}</p>
          <h2 className="nh-headline">{headline}</h2>
        </div>
        {nowTemp && <span className="nh-temp">{nowTemp}</span>}
      </div>
      <div className="nh-meta">
        <span>
          {data.peakPop > 0 ? `${Math.round(data.peakPop)}% chance` : 'Low chance'}
        </span>
        {hasPrecipMm(data.totalMm) && (
          <span>
            ~{formatPrecipAmount(data.totalMm, units)} {unit} total
          </span>
        )}
        <span className="nh-source">{data.source === '15-min' ? '15-min steps' : 'Hourly'}</span>
      </div>
      <div className="nh-bars" role="list">
        {data.slots.map((s) => {
          const h = Math.max(8, Math.round((s.mm / maxMm) * 100))
          return (
            <div key={s.label + s.mm} className="nh-col" role="listitem">
              <div className="nh-bar-track" aria-hidden>
                <div
                  className={`nh-bar-fill ${s.mm >= 0.1 ? 'has-precip' : ''}`}
                  style={{ height: `${h}%` }}
                />
              </div>
              <span className="nh-label">{s.label}</span>
              <span className="nh-amt">
                {s.mm < 0.05 ? '—' : formatPrecipAmount(s.mm, units)}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
