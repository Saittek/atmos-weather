/**
 * Full-viewport ambient weather — layered HQ particles, wind, lightning.
 * Behind UI (z-index 0). Respects reduced-motion + mobile-perf (CSS).
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { windVisual } from '../utils/windVisual'
import { WEATHER_ICON_FILES } from './weatherAssets'
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

export function atmosphereIntensityFromCode(code: number): AtmosphereIntensity {
  if (code === 51 || code === 56) return 1
  if (code === 53) return 2
  if (code === 55 || code === 57) return 3
  if (code === 61 || code === 66 || code === 80) return 1
  if (code === 63 || code === 81) return 2
  if (code === 65 || code === 67 || code === 82) return 3
  if (code === 71 || code === 85) return 1
  if (code === 73 || code === 77) return 2
  if (code === 75 || code === 86) return 3
  if (code === 95 || code === 96) return 2
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
  depth: number
  spin: number
}

function makeParticles(
  count: number,
  seed: number,
  kind: 'rain' | 'snow' | 'dust' | 'ember' | 'splash',
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
    const r6 = prand(seed + 5, i)
    const depth = r6 // 0 far … 1 near

    if (kind === 'rain') {
      const lenBase = intensity === 1 ? 10 : intensity === 2 ? 14 : 18
      const lenSpan = intensity === 1 ? 16 : intensity === 2 ? 24 : 34
      return {
        left: r1 * 100,
        delay: -(r2 * 2.4),
        duration: (intensity === 3 ? 0.32 : intensity === 2 ? 0.44 : 0.58) + r3 * 0.5 + (1 - depth) * 0.25,
        size: (lenBase + r4 * lenSpan) * (0.55 + depth * 0.7),
        opacity: ((intensity === 1 ? 0.22 : 0.32) + r5 * 0.4) * (0.45 + depth * 0.55),
        drift: windDrift * (0.7 + depth * 0.5) + (r4 - 0.5) * 12,
        ang: windAng + (r5 - 0.5) * 5,
        depth,
        spin: 0,
      }
    }

    if (kind === 'snow') {
      return {
        left: r1 * 100,
        delay: -(r2 * 4),
        duration: (intensity === 3 ? 3.2 : 4.2) + r3 * 3.5 + (1 - depth) * 2,
        size: (2.5 + r4 * (intensity === 3 ? 7 : 5)) * (0.5 + depth * 0.7),
        opacity: 0.35 + r5 * 0.55,
        drift: windDrift * 0.75 + (r4 - 0.5) * 48,
        ang: 0,
        depth,
        spin: 160 + r3 * 320,
      }
    }

    if (kind === 'dust') {
      return {
        left: r1 * 100,
        delay: -(r2 * 8),
        duration: 8 + r3 * 12,
        size: 1.2 + r4 * 2.4,
        opacity: 0.12 + r5 * 0.28,
        drift: (r4 - 0.5) * 40,
        ang: 0,
        depth,
        spin: 0,
      }
    }

    if (kind === 'ember') {
      return {
        left: 10 + r1 * 80,
        delay: -(r2 * 6),
        duration: 5 + r3 * 7,
        size: 2 + r4 * 3.5,
        opacity: 0.2 + r5 * 0.45,
        drift: (r4 - 0.5) * 30,
        ang: 0,
        depth,
        spin: 0,
      }
    }

    // splash
    return {
      left: r1 * 100,
      delay: -(r2 * 1.8),
      duration: 0.45 + r3 * 0.4,
      size: 2 + r4 * 4,
      opacity: 0.25 + r5 * 0.4,
      drift: (r4 - 0.5) * 16,
      ang: 0,
      depth,
      spin: 0,
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
      const base = intensity >= 3 ? 1100 : 1900
      const span = intensity >= 3 ? 3400 : 5000
      const gap = base + Math.random() * span
      timer = window.setTimeout(() => {
        if (cancelled) return
        setBoltSide(Math.floor(Math.random() * 5))
        setFlash(true)
        hideTimer = window.setTimeout(() => {
          if (!cancelled) setFlash(false)
        }, 80 + Math.random() * 110)

        if (Math.random() > (intensity >= 3 ? 0.28 : 0.42)) {
          doubleTimer = window.setTimeout(() => {
            if (cancelled) return
            setFlash(true)
            hideTimer = window.setTimeout(() => {
              if (!cancelled) setFlash(false)
            }, 60 + Math.random() * 70)
          }, 110 + Math.random() * 170)
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
    if (mode === 'storm') return mobile ? 28 + intensity * 8 : 48 + intensity * 14
    if (mode === 'rain') return mobile ? 16 + intensity * 8 : 26 + intensity * 16
    if (mode === 'drizzle') return mobile ? 12 + intensity * 4 : 18 + intensity * 8
    return 0
  }, [mode, mobile, intensity])

  const snowCount = useMemo(() => {
    if (mode !== 'snow') return 0
    return mobile ? 14 + intensity * 8 : 22 + intensity * 16
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

  const dust = useMemo(() => {
    if (mode !== 'clear-day' && mode !== 'cloudy') return []
    if (!isDay) return []
    const n = mobile ? 10 : 22
    return makeParticles(n, 42, 'dust', wind.ang, wind.drift, 1)
  }, [mode, isDay, mobile, wind.ang, wind.drift])

  const embers = useMemo(() => {
    if (mode !== 'smoke') return []
    return makeParticles(mobile ? 12 : 22, 88, 'ember', wind.ang, wind.drift, intensity)
  }, [mode, mobile, wind.ang, wind.drift, intensity])

  const splashes = useMemo(() => {
    if (mode !== 'rain' && mode !== 'storm' && mode !== 'drizzle') return []
    if (intensity < 2 && mode !== 'storm') return []
    const n = mobile ? 8 + intensity * 3 : 14 + intensity * 6
    return makeParticles(n, 55, 'splash', wind.ang, wind.drift, intensity)
  }, [mode, mobile, intensity, wind.ang, wind.drift])

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
      className={`wx-atmo wx-atmo-hq wx-atmo-${mode} wx-atmo-i${intensity}${flash ? ' is-flash' : ''}${mobile ? ' is-mobile' : ''}`}
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
      <div className="wx-atmo-shimmer" />
      <div className="wx-atmo-vignette" />

      {(mode === 'clear-day' || (mode === 'cloudy' && isDay)) && (
        <div className="wx-atmo-sunbeams">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      )}

      {mode === 'clear-day' && (
        <div className="wx-atmo-sun-orb wx-atmo-photo" aria-hidden>
          <img src={WEATHER_ICON_FILES.sun} alt="" draggable={false} decoding="async" />
        </div>
      )}

      {mode === 'clear-night' && (
        <>
          <div className="wx-atmo-moon-orb wx-atmo-photo" aria-hidden>
            <img src={WEATHER_ICON_FILES.moon} alt="" draggable={false} decoding="async" />
          </div>
          <div className="wx-atmo-stars">
            {Array.from({ length: mobile ? 22 : 48 }, (_, i) => (
              <i
                key={i}
                className={prand(12, i) > 0.82 ? 'bright' : ''}
                style={{
                  left: `${prand(99, i) * 100}%`,
                  top: `${prand(77, i) * 72}%`,
                  animationDelay: `${-prand(55, i) * 5}s`,
                  animationDuration: `${2.2 + prand(33, i) * 3.5}s`,
                  width: `${1 + prand(11, i) * 2.4}px`,
                  height: `${1 + prand(11, i) * 2.4}px`,
                }}
              />
            ))}
          </div>
          {!mobile && (
            <div className="wx-atmo-shoot">
              <span style={{ animationDelay: '-2s' }} />
              <span style={{ animationDelay: '-11s' }} />
            </div>
          )}
        </>
      )}

      {(mode === 'cloudy' ||
        mode === 'storm' ||
        mode === 'rain' ||
        mode === 'fog' ||
        mode === 'smoke' ||
        mode === 'snow' ||
        mode === 'drizzle') && (
        <div className="wx-atmo-clouds wx-atmo-clouds-photo">
          <img
            className="wx-cloud-img c1"
            src={mode === 'storm' ? WEATHER_ICON_FILES.storm : WEATHER_ICON_FILES.cloud}
            alt=""
            draggable={false}
            decoding="async"
          />
          <img
            className="wx-cloud-img c2"
            src={
              mode === 'storm' || mode === 'rain'
                ? WEATHER_ICON_FILES.cloudDark
                : WEATHER_ICON_FILES.cloud
            }
            alt=""
            draggable={false}
            decoding="async"
          />
          <img
            className="wx-cloud-img c3"
            src={mode === 'smoke' ? WEATHER_ICON_FILES.smoke : WEATHER_ICON_FILES.cloudDark}
            alt=""
            draggable={false}
            decoding="async"
          />
          {(mode === 'storm' || intensity >= 2) && (
            <img
              className="wx-cloud-img c4"
              src={mode === 'storm' ? WEATHER_ICON_FILES.thunder : WEATHER_ICON_FILES.cloud}
              alt=""
              draggable={false}
              decoding="async"
            />
          )}
          {/* Soft CSS haze under photos for depth */}
          <span className="wx-cloud c1" />
          <span className="wx-cloud c2" />
        </div>
      )}

      {(mode === 'fog' || mode === 'smoke') && (
        <div className={`wx-atmo-fog ${mode === 'smoke' ? 'smoke' : ''}`}>
          <span />
          <span />
          <span />
          <span />
          {intensity >= 2 && <span />}
          {intensity >= 3 && <span />}
        </div>
      )}

      {dust.length > 0 && (
        <div className="wx-atmo-dust">
          {dust.map((p, i) => (
            <i
              key={i}
              style={{
                left: `${p.left}%`,
                top: `${20 + prand(3, i) * 55}%`,
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

      {embers.length > 0 && (
        <div className="wx-atmo-embers">
          {embers.map((p, i) => (
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

      {rain.length > 0 && (
        <>
          <div className={`wx-atmo-rain wx-atmo-rain-far ${rainClass}`}>
            {rain
              .filter((p) => p.depth < 0.45)
              .map((p, i) => (
                <i
                  key={`f${i}`}
                  style={{
                    left: `${p.left}%`,
                    animationDelay: `${p.delay}s`,
                    animationDuration: `${p.duration}s`,
                    height: `${p.size}px`,
                    opacity: p.opacity * 0.55,
                    ['--drift' as string]: `${p.drift * 0.7}px`,
                    ['--ang' as string]: `${p.ang}deg`,
                  }}
                />
              ))}
          </div>
          <div className={`wx-atmo-rain wx-atmo-rain-near ${rainClass}`}>
            {rain
              .filter((p) => p.depth >= 0.45)
              .map((p, i) => (
                <i
                  key={`n${i}`}
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
          {splashes.length > 0 && (
            <div className="wx-atmo-splash">
              {splashes.map((p, i) => (
                <i
                  key={i}
                  style={{
                    left: `${p.left}%`,
                    animationDelay: `${p.delay}s`,
                    animationDuration: `${p.duration}s`,
                    width: `${p.size}px`,
                    height: `${p.size * 0.45}px`,
                    opacity: p.opacity,
                    ['--drift' as string]: `${p.drift}px`,
                  }}
                />
              ))}
            </div>
          )}
          {(mode === 'rain' || mode === 'storm') && intensity >= 2 && (
            <div className="wx-atmo-mist" />
          )}
        </>
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
                ['--spin' as string]: `${p.spin}deg`,
                ['--depth' as string]: String(p.depth),
              }}
            />
          ))}
        </div>
      )}

      {mode === 'storm' && (
        <>
          <div className="wx-atmo-flash" />
          <div className="wx-atmo-sheet" />
          <div className="wx-atmo-bolt b0" />
          <div className="wx-atmo-bolt b1" />
          <div className="wx-atmo-bolt b2" />
          <svg className="wx-atmo-bolt-svg" viewBox="0 0 100 120" aria-hidden>
            <path
              className="wx-bolt-path p0"
              d="M52 0 L38 48 L50 48 L34 120 L72 42 L54 42 Z"
            />
            <path
              className="wx-bolt-path p1"
              d="M60 4 L48 40 L58 40 L40 110 L78 38 L62 38 Z"
            />
          </svg>
        </>
      )}
    </div>
  )
}
