import type { LocationResult, LocationSnapshot, WeatherData } from '../api/types'
import { locationKey } from '../api/weather'
import type { Units } from '../utils/format'
import { formatTemp, parseWeatherLocal } from '../utils/format'
import { sameExactPlace } from '../hooks/useWeather'
import { getWeatherInfo } from '../utils/weatherCodes'
import { isDaytimeNow } from '../utils/daylight'
import { useI18n } from '../i18n/I18nProvider'

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

function rainLine(
  snap: LocationSnapshot | null,
  isHere: boolean,
  t: (key: Parameters<ReturnType<typeof useI18n>['t']>[0], vars?: Record<string, string | number>) => string,
  weather?: WeatherData,
): string {
  if (isHere && weather) {
    const now = Date.now()
    const start = weather.hourly.time.findIndex(
      (tm) => parseWeatherLocal(tm, weather.timezone) >= now - 30 * 60 * 1000,
    )
    const i = start < 0 ? 0 : start
    const pop = weather.hourly.precipitation_probability?.[i]
    const soon = weather.hourly.precipitation?.slice(i, i + 3).some((mm) => (mm ?? 0) > 0.2)
    if (soon) return t('commute.rainHours')
    if ((pop ?? 0) >= 40) return t('commute.chance', { n: Math.round(pop!) })
    return t('commute.dry')
  }
  if (!snap) return '—'
  if (snap.rainStartsInMin != null && snap.rainStartsInMin <= 120) {
    if (snap.rainStartsInMin <= 5) return t('commute.rainNow')
    return t('commute.rainIn', { n: snap.rainStartsInMin })
  }
  if (snap.precipSoon) return t('commute.rainLater')
  if (snap.popMax6h >= 40) return t('commute.next6h', { n: Math.round(snap.popMax6h) })
  return t('commute.dry')
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
  const { t } = useI18n()
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
              {c.id === 'home' ? '🏠' : '💼'} {c.id === 'home' ? t('commute.home') : t('commute.work')}
              {c.here ? ` · ${t('commute.here')}` : ''}
            </span>
            <strong className="commute-temp">
              {temp != null ? formatTemp(temp, units) : '—'}
            </strong>
            <span className="commute-cond">{info.label}</span>
            <span className="commute-rain">
              {rainLine(snap, c.here, t, c.here ? weather : undefined)}
            </span>
          </button>
        )
      })}
    </section>
  )
}
