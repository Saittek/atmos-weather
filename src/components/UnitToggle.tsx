import type { Units } from '../utils/format'

interface Props {
  units: Units
  onChange: (u: Units) => void
}

export function UnitToggle({ units, onChange }: Props) {
  return (
    <div className="unit-toggle" role="group" aria-label="Temperature units">
      <button
        type="button"
        className={units === 'imperial' ? 'active' : ''}
        onClick={() => onChange('imperial')}
        aria-pressed={units === 'imperial'}
        title="Fahrenheit"
      >
        °F
      </button>
      <button
        type="button"
        className={units === 'metric' ? 'active' : ''}
        onClick={() => onChange('metric')}
        aria-pressed={units === 'metric'}
        title="Celsius"
      >
        °C
      </button>
    </div>
  )
}
