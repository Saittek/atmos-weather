/**
 * Animated rain/snow amount icon — flowing water or falling snow.
 */
import { resolvePrecipKind, type PrecipKind } from '../utils/precipKind'

interface Props {
  /** Liquid-equivalent mm (API units) */
  intensity?: number
  kind?: PrecipKind
  tempC?: number | null
  weatherCode?: number | null
  className?: string
  size?: 'sm' | 'md'
}

export function PrecipMotionIcon({
  intensity = 0,
  kind,
  tempC,
  weatherCode,
  className = '',
  size = 'md',
}: Props) {
  const wet = intensity >= 0.05
  const resolved = kind ?? resolvePrecipKind(tempC, weatherCode, wet)
  const level = intensity < 0.05 ? 0 : intensity < 0.4 ? 1 : intensity < 1.5 ? 2 : 3

  if (!wet || resolved === 'dry') {
    return (
      <span
        className={`precip-motion dry ${size} ${className}`}
        aria-hidden
        title="Dry"
      >
        <span className="precip-dash">—</span>
      </span>
    )
  }

  const isSnow = resolved === 'snow'
  const isMix = resolved === 'mix'

  return (
    <span
      className={`precip-motion ${isSnow ? 'snow' : isMix ? 'mix' : 'rain'} level-${level} ${size} ${className}`}
      aria-hidden
      title={isSnow ? 'Snow' : isMix ? 'Wintry mix' : 'Rain'}
    >
      <span className="precip-motion-stage">
        {isSnow || isMix ? (
          <>
            <i className="flake f1" />
            <i className="flake f2" />
            <i className="flake f3" />
            {level >= 2 && <i className="flake f4" />}
            {level >= 3 && <i className="flake f5" />}
            {isMix && (
              <>
                <i className="drop d1" />
                <i className="drop d2" />
              </>
            )}
          </>
        ) : (
          <>
            <i className="wave w1" />
            <i className="wave w2" />
            <i className="drop d1" />
            <i className="drop d2" />
            <i className="drop d3" />
            {level >= 2 && <i className="drop d4" />}
            {level >= 3 && (
              <>
                <i className="drop d5" />
                <i className="splash" />
              </>
            )}
          </>
        )}
      </span>
    </span>
  )
}
