/**
 * Clear Dark Sky–style hourly matrix: cloud / transparency / seeing / dark.
 * Blue-ish = good for observing.
 */
import type { StargazeHour } from '../utils/stargaze'

interface Props {
  hours: StargazeHour[]
  /** Prefer centering the night in view */
  centerNight?: boolean
}

type RowKey = 'total' | 'low' | 'mid' | 'high' | 'trans' | 'seeing' | 'dark'

const ROWS: { key: RowKey; label: string; title: string }[] = [
  { key: 'total', label: 'Cloud', title: 'Total cloud cover' },
  { key: 'low', label: 'Low', title: 'Low cloud' },
  { key: 'mid', label: 'Mid', title: 'Mid cloud' },
  { key: 'high', label: 'High', title: 'High cloud' },
  { key: 'trans', label: 'Trans', title: 'Transparency (higher better)' },
  { key: 'seeing', label: 'See', title: 'Seeing (higher better)' },
  { key: 'dark', label: 'Dark', title: 'Astronomical darkness' },
]

function cellClass(key: RowKey, h: StargazeHour): string {
  if (!h.isNight && key !== 'dark') return 'csc-day'
  if (key === 'dark') {
    if (h.isDark) return 'csc-best'
    if (h.isNight) return 'csc-ok'
    return 'csc-day'
  }
  if (key === 'trans') {
    const t = h.transparency
    if (t >= 75) return 'csc-best'
    if (t >= 55) return 'csc-good'
    if (t >= 35) return 'csc-fair'
    return 'csc-poor'
  }
  if (key === 'seeing') {
    const s = h.seeing
    if (s >= 75) return 'csc-best'
    if (s >= 55) return 'csc-good'
    if (s >= 35) return 'csc-fair'
    return 'csc-poor'
  }
  // cloud rows — lower cloud = better (more blue)
  const c =
    key === 'low'
      ? h.cloudLow
      : key === 'mid'
        ? h.cloudMid
        : key === 'high'
          ? h.cloudHigh
          : h.cloud
  if (c <= 15) return 'csc-best'
  if (c <= 35) return 'csc-good'
  if (c <= 60) return 'csc-fair'
  if (c <= 80) return 'csc-poor'
  return 'csc-bad'
}

function cellTitle(key: RowKey, h: StargazeHour): string {
  if (key === 'dark') return h.isDark ? 'Astronomical dark' : h.isNight ? 'Twilight/night' : 'Day'
  if (key === 'trans') return `Transparency ${h.transparency}`
  if (key === 'seeing') return `Seeing ${h.seeing}`
  if (key === 'low') return `Low cloud ${h.cloudLow}%`
  if (key === 'mid') return `Mid cloud ${h.cloudMid}%`
  if (key === 'high') return `High cloud ${h.cloudHigh}%`
  return `Cloud ${h.cloud}% · score ${h.score}`
}

export function ClearSkyChart({ hours, centerNight = true }: Props) {
  // ~96h of hours, prefer night-centered slice
  let slice = hours.filter((h) => h.ms < Date.now() + 96 * 3600_000)
  if (centerNight && slice.length > 48) {
    const mid = slice.findIndex((h) => h.isNight && h.ms >= Date.now())
    if (mid > 8) {
      const start = Math.max(0, mid - 6)
      slice = slice.slice(start, start + 72)
    } else {
      slice = slice.slice(0, 72)
    }
  } else {
    slice = slice.slice(0, 72)
  }

  if (slice.length < 4) {
    return <p className="muted-center">Not enough hours for a clear-sky chart yet.</p>
  }

  // Tick labels every 3 hours
  const ticks = slice.map((h, i) => (i % 3 === 0 ? h.label : ''))

  return (
    <div className="csc-wrap" role="img" aria-label="Clear sky style hourly chart">
      <div className="csc-scroll">
        <table className="csc-table">
          <thead>
            <tr>
              <th className="csc-corner" />
              {ticks.map((t, i) => (
                <th key={slice[i].time} className="csc-tick">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => {
              // Hide layer rows if all zeros/missing same as total
              if (
                (row.key === 'low' || row.key === 'mid' || row.key === 'high') &&
                !slice.some((h) => h.hasCloudLayers)
              ) {
                return null
              }
              return (
                <tr key={row.key}>
                  <th className="csc-row-label" title={row.title}>
                    {row.label}
                  </th>
                  {slice.map((h) => (
                    <td
                      key={h.time + row.key}
                      className={`csc-cell ${cellClass(row.key, h)}`}
                      title={`${h.label}: ${cellTitle(row.key, h)}`}
                    />
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="csc-legend" aria-hidden>
        <span className="csc-best">Good</span>
        <span className="csc-good">OK</span>
        <span className="csc-fair">Fair</span>
        <span className="csc-poor">Poor</span>
        <span className="csc-bad">Socked in</span>
        <span className="csc-day">Day</span>
      </div>
      <p className="csc-hint">
        Read left → right. Blue blocks = clearer / steadier / darker. Inspired by Clear Dark Sky
        charts.
      </p>
    </div>
  )
}
