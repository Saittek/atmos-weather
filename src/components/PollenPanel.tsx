import type { AirQualityData } from '../api/types'
import { extractPollen, pollenAdvice } from '../utils/pollen'

interface Props {
  air: AirQualityData | null
}

export function PollenPanel({ air }: Props) {
  const items = extractPollen(air)
  const advice = pollenAdvice(items)

  return (
    <section className="panel pollen-panel">
      <div className="panel-header">
        <h2>🌿 Pollen & allergies</h2>
      </div>
      {!items.length ? (
        <p className="muted-center">{advice}</p>
      ) : (
        <>
          <p className="pollen-advice">{advice}</p>
          <div className="pollen-grid">
            {items.map((p) => (
              <div className="pollen-item" key={p.name}>
                <div className="pollen-top">
                  <span>{p.name}</span>
                  <span className="pollen-val" style={{ color: p.color }}>
                    {p.value}
                  </span>
                </div>
                <div className="pollen-bar">
                  <div
                    className="pollen-fill"
                    style={{
                      width: `${Math.min(100, (p.value / 120) * 100)}%`,
                      background: p.color,
                    }}
                  />
                </div>
                <span className="pollen-level" style={{ color: p.color }}>
                  {p.level}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
