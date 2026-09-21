import type { LocationResult, LocationSnapshot, WeatherData } from '../api/types'
import { locationKey } from '../api/weather'
import type { Units } from '../utils/format'
import { formatTemp } from '../utils/format'
import { sameExactPlace } from '../hooks/useWeather'
import { getWeatherInfo } from '../utils/weatherCodes'
import { isDaytimeNow } from '../utils/daylight'

interface Props {
  units: Units
  current: LocationResult
  weather: WeatherData
  home: LocationResult | null
  work: LocationResult | null
  snapshots: LocationSnapshot[]
  onGoHome?: () => void
  onGoWork?: () => void
}

function rainLine(snap: LocationSnapshot | null, isHere: boolean, weather?: WeatherData): string {
  if (isHere && weather) {
    const pop = weather.hourly.precipitation_probability?.[0]
    const soon = weather.hourly.precipitation?.slice(0, 3).some((mm) => (mm ?? 0) > 0.2)
    if (soon) return 'Rain in the next few hours'
    if ((pop ?? 0) >= 40) return `${Math.round(pop!)}% chance`
    return 'Dry for now'
  }
  if (!snap) return '—'
  if (snap.rainStartsInMin != null && snap.rainStartsInMin <= 120) {
    if (snap.rainStartsInMin <= 5) return 'Rain starting now'
    return `Rain in ~${snap.rainStartsInMin} min`
  }
  if (snap.precipSoon) return 'Rain later'
  if (snap.popMax6h >= 40) return `${Math.round(snap.popMax6h)}% next 6h`
  return 'Dry for now'
}

function pickSnap(
  snaps: LocationSnapshot[],
  place: LocationResult | null,
): LocationSnapshot | null {
  if (!place) return null
  const k = locationKey(place)
  return snaps.find((s) => locationKey(s.location) === k) ?? null
}

export function CommuteRow({
  units,
  current,
  weather,
  home,
  work,
  snapshots,
  onGoHome,
  onGoWork,
}: Props) {
  if (!home && !work) return null
  const hereHome = home ? sameExactPlace(current, home) : false
  const hereWork = work ? sameExactPlace(current, work) : false

  const cells: {
    id: string
    label: string
    place: LocationResult
    here: boolean
    onGo?: () => void
  }[] = []
  if (home) cells.push({ id: 'home', label: 'Home', place: home, here: hereHome, onGo: onGoHome })
  if (work) cells.push({ id: 'work', label: 'Work', place: work, here: hereWork, onGo: onGoWork })

  return (
    <section className="commute-row" aria-label="Home and work">
      {cells.map((c) => {
        const snap = pickSnap(snapshots, c.place)
        const temp = c.here ? weather.current.temperature_2m : snap?.temperature
        const code = c.here ? weather.current.weather_code : snap?.weatherCode ?? 0
        const day = c.here ? isDaytimeNow(weather) : snap?.isDay ?? true
        const info = getWeatherInfo(code, day)
        return (
          <button
            key={c.id}
            type="button"
            className={`commute-card ${c.here ? 'is-here' : ''}`}
            onClick={c.onGo}
            disabled={!c.onGo}
          >
            <span className="commute-kicker">
              {c.id === 'home' ? '🏠' : '💼'} {c.label}
              {c.here ? ' · here' : ''}
            </span>
            <strong className="commute-temp">
              {temp != null ? formatTemp(temp, units) : '—'}
            </strong>
            <span className="commute-cond">{info.label}</span>
            <span className="commute-rain">{rainLine(snap, c.here, c.here ? weather : undefined)}</span>
          </button>
        )
      })}
    </section>
  )
}
