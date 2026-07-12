import { parseWeatherLocal } from '../utils/format'

interface Props {
  /** ISO local times from Open-Meteo */
  times: string[]
  timezone?: string
  /** Show every Nth label (auto if omitted) */
  step?: number
  className?: string
}

/** Shared horizontal time labels under charts */
export function ChartTimeAxis({ times, timezone, step, className = '' }: Props) {
  if (!times.length) return null

  const n = times.length
  // Prefer ~5–8 labels across the axis
  const autoStep = step ?? Math.max(1, Math.round(n / 6))

  const labelAt = (i: number) => {
    const ms = parseWeatherLocal(times[i], timezone)
    try {
      return new Date(ms).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: timezone ? undefined : '2-digit',
        timeZone: timezone,
      })
    } catch {
      return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric' })
    }
  }

  // Always include first + last
  const indices = new Set<number>()
  for (let i = 0; i < n; i += autoStep) indices.add(i)
  indices.add(0)
  indices.add(n - 1)

  return (
    <div className={`chart-time-axis ${className}`} aria-hidden>
      {times.map((t, i) => (
        <span
          key={`${t}-${i}`}
          className={`chart-time-tick ${indices.has(i) ? 'show' : ''}`}
        >
          {indices.has(i) ? (i === 0 ? 'Now' : labelAt(i)) : ''}
        </span>
      ))}
    </div>
  )
}

/** Compact labels for bar charts (one under each column) */
export function BarTimeLabels({
  times,
  timezone,
  dense = false,
}: {
  times: string[]
  timezone?: string
  /** If true, show every label; else every 2–3 */
  dense?: boolean
}) {
  if (!times.length) return null
  const step = dense ? 1 : times.length > 16 ? 3 : times.length > 10 ? 2 : 1

  return (
    <div className="bar-time-labels" aria-hidden>
      {times.map((t, i) => {
        const show = i === 0 || i === times.length - 1 || i % step === 0
        const ms = parseWeatherLocal(t, timezone)
        let label = ''
        if (show) {
          if (i === 0) label = 'Now'
          else {
            try {
              label = new Date(ms).toLocaleTimeString(undefined, {
                hour: 'numeric',
                timeZone: timezone,
              })
            } catch {
              label = new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric' })
            }
          }
        }
        return (
          <span key={`${t}-${i}`} className={show ? 'show' : ''}>
            {label}
          </span>
        )
      })}
    </div>
  )
}
