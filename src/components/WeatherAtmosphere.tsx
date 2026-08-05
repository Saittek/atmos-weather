/**
 * Full-viewport ambient weather — rain, snow, fog, clear shimmer, storm lightning.
 * Intensity-aware + wind-slanted particles. Behind UI (z-index 0).
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { windVisual } from '../utils/windVisual'
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

export type AtmosphereIntensity = 1 | 2 | 3

interface Props {
  code?: number | null
  isDay?: boolean
  mobile?: boolean
  windSpeed?: number | null
  windDir?: number | null
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

/** 1 light · 2 moderate · 3 heavy from WMO-ish codes */
export function atmosphereIntensityFromCode(code: number): AtmosphereIntensity {
  // drizzle
  if (code === 51 || code === 56) return 1
  if (code === 53) return 2
  if (code === 55 || code === 57) return 3
  // rain
  if (code === 61 || code === 66 || code === 80) return 1
  if (code === 63 || code === 81) return 2
  if (code === 65 || code === 67 || code === 82) return 3
  // snow
  if (code === 71 || code === 85) return 1
  if (code === 73 || code === 77) return 2
  if (code === 75 || code === 86) return 3
  // storm
  if (code === 95) return 2
  if (code === 96) return 2
  if (code === 99) return 3
  if (code === 3) return 2
  return 1
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
  ang: number
}

function makeParticles(
  count: number,
  seed: number,
  kind: 'rain' | 'snow',
  windAng: number,
  windDrift: number,
  intensity: AtmosphereIntensity,
): Particle[] {
  return Array.from({ length: count }, (_, i) => {
    const r1 = prand(seed, i)
    const r2 = prand(seed + 1, i)
    const r3 = prand(seed + 2, i)
    const r4 = prand(seed + 3, i)
    const r5 = prand(seed + 4, i)
    if (kind === 'rain') {
      const lenBase = intensity === 1 ? 8 : intensity === 2 ? 12 : 16
      const lenSpan = intensity === 1 ? 14 : intensity === 2 ? 20 : 28
      return {
        left: r1 * 100,
        delay: -(r2 * 2.2),
        duration: (intensity === 3 ? 0.38 : intensity === 2 ? 0.5 : 0.65) + r3 * 0.55,
        size: lenBase + r4 * lenSpan,
        opacity: (intensity === 1 ? 0.28 : 0.38) + r5 * 0.4,
        drift: windDrift + (r4 - 0.5) * 10,
        ang: windAng + (r5 - 0.5) * 5,
      }
    }
    return {
      left: r1 * 100,
      delay: -(r2 * 4),
      duration: (intensity === 3 ? 2.6 : 3.4) + r3 * 4,
      size: (intensity === 1 ? 1.5 : 2) + r4 * (intensity === 3 ? 6 : 4.5),
      opacity: 0.4 + r5 * 0.5,
      drift: windDrift * 0.8 + (r4 - 0.5) * 36,
      ang: 0,
    }
  })
}

export function WeatherAtmosphere({
  code = null,
  isDay = true,
  mobile = false,
  windSpeed = null,
  windDir = null,
}: Props) {
  const reduced = usePrefersReducedMotion()
  const mode = useMemo(() => {
    if (code == null || code < 0) return 'none' as AtmosphereMode
    return atmosphereModeFromCode(code, isDay)
  }, [code, isDay])
  const intensity = useMemo(
    () => (code == null ? 1 : atmosphereIntensityFromCode(code)),
    [code],
  )
  const wind = useMemo(() => windVisual(windSpeed, windDir), [windSpeed, windDir])

  const [flash, setFlash] = useState(false)
  const [boltSide, setBoltSide] = useState(0)

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
      // Heavier storms flash more often
      const base = intensity >= 3 ? 1200 : 2000
      const span = intensity >= 3 ? 3600 : 5200
      const gap = base + Math.random() * span
      timer = window.setTimeout(() => {
        if (cancelled) return
        setBoltSide(Math.floor(Math.random() * 5))
        setFlash(true)
        hideTimer = window.setTimeout(() => {
          if (!cancelled) setFlash(false)
        }, 90 + Math.random() * 100)

        if (Math.random() > (intensity >= 3 ? 0.3 : 0.45)) {
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
  }, [mode, reduced, intensity])

  const rainCount = useMemo(() => {
    if (mode === 'storm') return mobile ? 22 + intensity * 6 : 36 + intensity * 10
    if (mode === 'rain') return mobile ? 12 + intensity * 6 : 18 + intensity * 12
    if (mode === 'drizzle') return mobile ? 10 + intensity * 3 : 14 + intensity * 6
    return 0
  }, [mode, mobile, intensity])

  const snowCount = useMemo(() => {
    if (mode !== 'snow') return 0
    return mobile ? 10 + intensity * 6 : 16 + intensity * 12
  }, [mode, mobile, intensity])

  const rain = useMemo(
    () =>
      rainCount > 0
        ? makeParticles(rainCount, code ?? 61, 'rain', wind.ang, wind.drift, intensity)
        : [],
    [rainCount, code, wind.ang, wind.drift, intensity],
  )
  const snow = useMemo(
    () =>
      snowCount > 0
        ? makeParticles(snowCount, code ?? 71, 'snow', wind.ang, wind.drift, intensity)
        : [],
    [snowCount, code, wind.ang, wind.drift, intensity],
  )

  if (mode === 'none' || reduced) {
    if (reduced && mode === 'storm') {
      return <div className="wx-atmo wx-atmo-storm-static" aria-hidden />
    }
    if (reduced && (mode === 'rain' || mode === 'snow' || mode === 'fog' || mode === 'smoke')) {
      return (
        <div
          className={`wx-atmo wx-atmo-${mode} wx-atmo-i${intensity} is-static`}
          aria-hidden
        >
          <div className="wx-atmo-wash" />
        </div>
      )
    }
    if (reduced) return null
    if (mode === 'none') return null
  }

  const rainClass =
    mode === 'drizzle' || intensity === 1
      ? 'light'
      : mode === 'storm' || intensity === 3
        ? 'heavy'
        : 'med'

  return (
    <div
      className={`wx-atmo wx-atmo-${mode} wx-atmo-i${intensity}${flash ? ' is-flash' : ''}${mobile ? ' is-mobile' : ''}`}
      data-bolt={boltSide}
      style={
        {
          ['--w-ang']: `${wind.ang}deg`,
          ['--w-drift']: `${wind.drift}px`,
        } as CSSProperties
      }
      aria-hidden
    >
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
          {Array.from({ length: mobile ? 16 : 34 }, (_, i) => (
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

      {(mode === 'cloudy' ||
        mode === 'storm' ||
        mode === 'rain' ||
        mode === 'fog' ||
        mode === 'smoke' ||
        mode === 'snow') && (
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
          <span />
          {intensity >= 2 && <span />}
        </div>
      )}

      {rain.length > 0 && (
        <div className={`wx-atmo-rain ${rainClass}`}>
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
                ['--ang' as string]: `${p.ang}deg`,
              }}
            />
          ))}
        </div>
      )}

      {snow.length > 0 && (
        <div className={`wx-atmo-snow i${intensity}`}>
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
