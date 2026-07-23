/**
 * Allergy outlook — pollen types, overall risk, peaks, mold-friendly air, tips.
 */
import type { AirQualityData, WeatherData } from '../api/types'
import { formatHour } from '../utils/format'
import {
  allergyTips,
  extractPollen,
  moldRiskFromWeather,
  overallAllergyRisk,
  pollenAdvice,
  pollenPeakHours,
  type PollenItem,
} from '../utils/pollen'

interface Props {
  air: AirQualityData | null
  weather?: WeatherData | null
  /** Compact strip for simple mode */
  compact?: boolean
}

function levelClass(level: string): string {
  if (level === 'very high' || level === 'high') return 'risk-high'
  if (level === 'moderate') return 'risk-mod'
  if (level === 'low' || level === 'none') return 'risk-low'
  return 'risk-unknown'
}

export function AllergySection({ air, weather = null, compact = false }: Props) {
  const items = extractPollen(air)
  const risk = overallAllergyRisk(items)
  const advice = pollenAdvice(items)
  const mold = moldRiskFromWeather(weather)
  const peaks = pollenPeakHours(air, weather?.timezone || air?.timezone)
  const tips = allergyTips(items, risk, mold, weather)
  const top: PollenItem[] = items.slice(0, compact ? 4 : 6)

  return (
    <section
      className={`panel allergy-section ${compact ? 'allergy-compact' : ''} risk-${risk.level.replace(/\s+/g, '-')}`}
      aria-label="Allergies"
    >
      <div className="panel-header">
        <h2>🤧 Allergies</h2>
        <span
          className={`allergy-risk-pill ${levelClass(risk.level)}`}
          style={{ borderColor: risk.color, color: risk.color }}
        >
          {risk.label}
        </span>
      </div>

      <div className="allergy-hero">
        <p className="allergy-advice">{advice}</p>
        {risk.topName && risk.level !== 'low' && risk.level !== 'unknown' && (
          <p className="allergy-top-line">
            Top allergen: <strong style={{ color: risk.color }}>{risk.topName}</strong>
          </p>
        )}
      </div>

      {top.length > 0 ? (
        <div className={`allergy-grid ${compact ? 'allergy-grid-compact' : ''}`}>
          {top.map((p) => (
            <div className="allergy-item" key={p.key || p.name}>
              <div className="allergy-item-top">
                <span className="allergy-name">{p.name}</span>
                <span className="allergy-val" style={{ color: p.color }}>
                  {p.value}
                </span>
              </div>
              <div className="allergy-bar" aria-hidden>
                <div
                  className="allergy-fill"
                  style={{
                    width: `${Math.min(100, (p.value / 120) * 100)}%`,
                    background: p.color,
                  }}
                />
              </div>
              <span className="allergy-level" style={{ color: p.color }}>
                {p.level}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted-center allergy-empty">
          Live pollen counts aren’t published for every region. Mold/humidity tips still apply
          below.
        </p>
      )}

      {!compact && peaks.length > 0 && (
        <div className="allergy-peaks">
          <span className="allergy-subhead">Peak next hours</span>
          <ul className="allergy-peak-list">
            {peaks.map((pk) => {
              const match = items.find((x) => x.name === pk.name)
              const color = match?.color ?? '#eab308'
              return (
                <li key={`${pk.name}-${pk.time}`}>
                  <strong>{pk.name}</strong>
                  <span>{formatHour(pk.time, weather?.timezone || air?.timezone)}</span>
                  <span style={{ color }}>{pk.value}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {mold && (
        <div className={`allergy-mold ${levelClass(mold.level)}`}>
          <div className="allergy-mold-head">
            <span>🦠 {mold.label}</span>
            <span className="allergy-mold-level" style={{ color: mold.color }}>
              {mold.level}
            </span>
          </div>
          <p className="allergy-mold-detail">{mold.detail}</p>
        </div>
      )}

      {!compact && tips.length > 0 && (
        <ul className="allergy-tips">
          {tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}

      <p className="allergy-footnote muted-center">
        Pollen from Open-Meteo / CAMS · regional coverage varies · not medical advice
      </p>
    </section>
  )
}
