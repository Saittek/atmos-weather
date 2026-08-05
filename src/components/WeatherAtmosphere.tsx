/**
 * Full-viewport ambient weather — rain, snow, fog, clear shimmer, storm lightning.
 * Sits behind UI (z-index 0). Lightweight CSS particles + timed lightning flashes.
 */
import { useEffect, useMemo, useState } from 'react'
import './weather-atmosphere.css'

export type AtmosphereMode =
  | 'clear-day'
  | 'clear-night'
  | 'cloudy'
  | 'fog'
  | 'smoke'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'storm'
  | 'none'

interface Props {
  code?: number | null
  isDay?: boolean
  /** Prefer fewer particles on phones */
  mobile?: boolean
}

export function atmosphereModeFromCode(code: number, isDay = true): AtmosphereMode {
  if (code === 0) return isDay ? 'clear-day' : 'clear-night'
  if (code === 1) return isDay ? 'clear-day' : 'clear-night'
  if (code === 2 || code === 3) return 'cloudy'
  if (code === 44) return 'smoke'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 57) return 'drizzle'
  if (code >= 61 && code <= 67) return 'rain'
  if (code >= 71 && code <= 77) return 'snow'
  if (code >= 80 && code <= 82) return 'rain'
  if (code === 85 || code === 86) return 'snow'
  if (code >= 95 && code <= 99) return 'storm'
  return 'none'
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

/** Stable pseudo-random 0–1 from seed + index */
function prand(seed: number, i: number): number {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453
  return x - Math.floor(x)
}

interface Particle {
  left: number
  delay: number
  duration: number
  size: number
  opacity: number
  drift: number
}

function makeParticles(count: number, seed: number, kind: 'rain' | 'snow'): Particle[] {
  return Array.from({ length: count }, (_, i) => {
    const r1 = prand(seed, i)
    const r2 = prand(seed + 1, i)
    const r3 = prand(seed + 2, i)
    const r4 = prand(seed + 3, i)
    const r5 = prand(seed + 4, i)
    if (kind === 'rain') {
      return {
        left: r1 * 100,
        delay: -(r2 * 2.2),
        duration: 0.45 + r3 * 0.7,
        size: 10 + r4 * 22,
        opacity: 0.35 + r5 * 0.55,
        drift: -6 - r4 * 14,
      }
    }
    return {
      left: r1 * 100,
      delay: -(r2 * 4),
      duration: 3.5 + r3 * 4.5,
      size: 2 + r4 * 5,
      opacity: 0.45 + r5 * 0.5,
      drift: (r4 - 0.5) * 40,
    }
  })
}

export function WeatherAtmosphere({ code = null, isDay = true, mobile = false }: Props) {
  const reduced = usePrefersReducedMotion()
  const mode = useMemo(() => {
    if (code == null || code < 0) return 'none' as AtmosphereMode
    return atmosphereModeFromCode(code, isDay)
  }, [code, isDay])

  const [flash, setFlash] = useState(false)
  const [boltSide, setBoltSide] = useState(0)

  // Random lightning for storms
  useEffect(() => {
    if (mode !== 'storm' || reduced) {
      setFlash(false)
      return
    }
    let cancelled = false
    let timer = 0
    let hideTimer = 0
    let doubleTimer = 0

    const schedule = () => {
      const gap = 1800 + Math.random() * 5200
      timer = window.setTimeout(() => {
        if (cancelled) return
        setBoltSide(Math.floor(Math.random() * 5))
        setFlash(true)
        hideTimer = window.setTimeout(() => {
          if (!cancelled) setFlash(false)
        }, 90 + Math.random() * 100)

        // Occasional double-strike
        if (Math.random() > 0.45) {
          doubleTimer = window.setTimeout(() => {
            if (cancelled) return
            setFlash(true)
            hideTimer = window.setTimeout(() => {
              if (!cancelled) setFlash(false)
            }, 70 + Math.random() * 60)
          }, 120 + Math.random() * 160)
        }
        schedule()
      }, gap)
    }
    schedule()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      window.clearTimeout(hideTimer)
      window.clearTimeout(doubleTimer)
    }
  }, [mode, reduced])

  const rainCount = mobile ? (mode === 'storm' ? 28 : mode === 'rain' ? 22 : 14) : mode === 'storm' ? 48 : mode === 'rain' ? 36 : 22
  const snowCount = mobile ? 18 : 32

  const rain = useMemo(
    () =>
      mode === 'rain' || mode === 'drizzle' || mode === 'storm'
        ? makeParticles(rainCount, code ?? 61, 'rain')
        : [],
    [mode, rainCount, code],
  )
  const snow = useMemo(
    () => (mode === 'snow' ? makeParticles(snowCount, code ?? 71, 'snow') : []),
    [mode, snowCount, code],
  )

  if (mode === 'none' || reduced) {
    // Soft static tint only for reduced motion when storming
    if (reduced && mode === 'storm') {
      return <div className="wx-atmo wx-atmo-storm-static" aria-hidden />
    }
    if (reduced) return null
    if (mode === 'none') return null
  }

  return (
    <div
      className={`wx-atmo wx-atmo-${mode}${flash ? ' is-flash' : ''}${mobile ? ' is-mobile' : ''}`}
      data-bolt={boltSide}
      aria-hidden
    >
      {/* Mood wash */}
      <div className="wx-atmo-wash" />
      <div className="wx-atmo-vignette" />

      {(mode === 'clear-day' || mode === 'cloudy') && isDay && (
        <div className="wx-atmo-sunbeams">
          <span />
          <span />
          <span />
        </div>
      )}

      {mode === 'clear-night' && (
        <div className="wx-atmo-stars">
          {Array.from({ length: mobile ? 18 : 36 }, (_, i) => (
            <i
              key={i}
              style={{
                left: `${prand(99, i) * 100}%`,
                top: `${prand(77, i) * 70}%`,
                animationDelay: `${-prand(55, i) * 4}s`,
                animationDuration: `${2 + prand(33, i) * 3}s`,
                width: `${1 + prand(11, i) * 2}px`,
                height: `${1 + prand(11, i) * 2}px`,
              }}
            />
          ))}
        </div>
      )}

      {(mode === 'cloudy' || mode === 'storm' || mode === 'rain' || mode === 'fog' || mode === 'smoke') && (
        <div className="wx-atmo-clouds">
          <span className="wx-cloud c1" />
          <span className="wx-cloud c2" />
          <span className="wx-cloud c3" />
        </div>
      )}

      {(mode === 'fog' || mode === 'smoke') && (
        <div className={`wx-atmo-fog ${mode === 'smoke' ? 'smoke' : ''}`}>
          <span />
          <span />
          <span />
        </div>
      )}

      {rain.length > 0 && (
        <div className={`wx-atmo-rain ${mode === 'drizzle' ? 'light' : mode === 'storm' ? 'heavy' : ''}`}>
          {rain.map((p, i) => (
            <i
              key={i}
              style={{
                left: `${p.left}%`,
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.duration}s`,
                height: `${p.size}px`,
                opacity: p.opacity,
                ['--drift' as string]: `${p.drift}px`,
              }}
            />
          ))}
        </div>
      )}

      {snow.length > 0 && (
        <div className="wx-atmo-snow">
          {snow.map((p, i) => (
            <i
              key={i}
              style={{
                left: `${p.left}%`,
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.duration}s`,
                width: `${p.size}px`,
                height: `${p.size}px`,
                opacity: p.opacity,
                ['--drift' as string]: `${p.drift}px`,
              }}
            />
          ))}
        </div>
      )}

      {mode === 'storm' && (
        <>
          <div className="wx-atmo-flash" />
          <div className="wx-atmo-bolt b0" />
          <div className="wx-atmo-bolt b1" />
          <div className="wx-atmo-bolt b2" />
        </>
      )}
    </div>
  )
}
