import { useId, type CSSProperties } from 'react'
import { windVisual } from '../utils/windVisual'
import { weatherIconHasLiveFx, weatherIconSrc } from './weatherAssets'
import './weather-3d.css'

export { windVisual } from '../utils/windVisual'

/** Distinct animated 3D scenes for all WMO weather groups */
export type Weather3DKind =
  | 'clear-day'
  | 'clear-night'
  | 'mostly-day'
  | 'mostly-night'
  | 'partly-day'
  | 'partly-night'
  | 'overcast'
  | 'fog'
  | 'smoke'
  | 'rime'
  | 'drizzle'
  | 'freezing-drizzle'
  | 'rain'
  | 'freezing-rain'
  | 'snow'
  | 'grains'
  | 'showers'
  | 'snow-showers'
  | 'thunder'
  | 'thunder-hail'

export type Weather3DIntensity = 1 | 2 | 3

interface Props {
  code: number
  isDay?: boolean
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  /** Force continuous animation even on sm */
  forceAnimate?: boolean
  /** Wind m/s or km/h — Open-Meteo default is km/h for speed_10m */
  windSpeed?: number | null
  /** Wind FROM direction in degrees (meteorological) */
  windDir?: number | null
}

export function weatherKindFromCode(
  code: number,
  isDay = true,
): { kind: Weather3DKind; intensity: Weather3DIntensity } {
  if (code === 0) return { kind: isDay ? 'clear-day' : 'clear-night', intensity: 1 }
  if (code === 1) return { kind: isDay ? 'mostly-day' : 'mostly-night', intensity: 1 }
  if (code === 2) return { kind: isDay ? 'partly-day' : 'partly-night', intensity: 1 }
  if (code === 3) return { kind: 'overcast', intensity: 2 }
  if (code === 44) return { kind: 'smoke', intensity: 2 }
  if (code === 45) return { kind: 'fog', intensity: 2 }
  if (code === 48) return { kind: 'rime', intensity: 2 }

  if (code === 51) return { kind: 'drizzle', intensity: 1 }
  if (code === 53) return { kind: 'drizzle', intensity: 2 }
  if (code === 55) return { kind: 'drizzle', intensity: 3 }
  if (code === 56) return { kind: 'freezing-drizzle', intensity: 1 }
  if (code === 57) return { kind: 'freezing-drizzle', intensity: 3 }

  if (code === 61) return { kind: 'rain', intensity: 1 }
  if (code === 63) return { kind: 'rain', intensity: 2 }
  if (code === 65) return { kind: 'rain', intensity: 3 }
  if (code === 66) return { kind: 'freezing-rain', intensity: 1 }
  if (code === 67) return { kind: 'freezing-rain', intensity: 3 }

  if (code === 71) return { kind: 'snow', intensity: 1 }
  if (code === 73) return { kind: 'snow', intensity: 2 }
  if (code === 75) return { kind: 'snow', intensity: 3 }
  if (code === 77) return { kind: 'grains', intensity: 2 }

  if (code === 80) return { kind: 'showers', intensity: 1 }
  if (code === 81) return { kind: 'showers', intensity: 2 }
  if (code === 82) return { kind: 'showers', intensity: 3 }
  if (code === 85) return { kind: 'snow-showers', intensity: 1 }
  if (code === 86) return { kind: 'snow-showers', intensity: 3 }

  if (code === 95) return { kind: 'thunder', intensity: 2 }
  if (code === 96) return { kind: 'thunder-hail', intensity: 2 }
  if (code === 99) return { kind: 'thunder-hail', intensity: 3 }

  return { kind: isDay ? 'partly-day' : 'partly-night', intensity: 1 }
}

/** Stable 0–1 hash so each streak differs without layout flicker */
function dropRand(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

/**
 * Rain streaks with per-drop variance + optional wind lean.
 */
function Drops({
  n,
  className,
  windAng = 12,
  windDrift = -10,
}: {
  n: number
  className?: string
  windAng?: number
  windDrift?: number
}) {
  return (
    <div className={className}>
      {Array.from({ length: n }, (_, i) => {
        const r1 = dropRand(i, 1)
        const r2 = dropRand(i, 2)
        const r3 = dropRand(i, 3)
        const r4 = dropRand(i, 4)
        const r5 = dropRand(i, 5)
        const r6 = dropRand(i, 6)
        const r7 = dropRand(i, 7)
        const r8 = dropRand(i, 8)
        const cluster = Math.floor(r1 * 5)
        const left = cluster * 18 + r2 * 16 + r3 * 4
        const angJitter = (r8 - 0.5) * 6
        const driftJitter = (r2 - 0.5) * 8
        return (
          <span
            key={i}
            style={{
              ['--i' as string]: i,
              ['--n' as string]: n,
              left: `${Math.min(98, Math.max(1, left))}%`,
              animationDelay: `${-(r4 * 1.9)}s`,
              animationDuration: `${0.52 + r5 * 0.55}s`,
              ['--len' as string]: `${14 + r6 * 26}%`,
              ['--thick' as string]: `${0.7 + r7 * 1.1}px`,
              ['--ang' as string]: `${windAng + angJitter}deg`,
              ['--op' as string]: `${0.28 + r3 * 0.45}`,
              ['--wind' as string]: `${windDrift + driftJitter}px`,
            }}
          />
        )
      })}
    </div>
  )
}

/** Soft snow flakes — varied size, drift, spin, opacity (not identical ❄ grid). */
function Flakes({
  n,
  glyph = '❄',
  windDrift = 8,
  soft = false,
}: {
  n: number
  glyph?: string
  windDrift?: number
  soft?: boolean
}) {
  return (
    <div className={`w3d-snow${soft ? ' soft' : ''}`}>
      {Array.from({ length: n }, (_, i) => {
        const r1 = dropRand(i, 11)
        const r2 = dropRand(i, 12)
        const r3 = dropRand(i, 13)
        const r4 = dropRand(i, 14)
        const r5 = dropRand(i, 15)
        const r6 = dropRand(i, 16)
        const size = soft ? 0.35 + r1 * 0.55 : 0.55 + r1 * 0.9
        const sway = windDrift * (0.4 + r2) + (r3 - 0.5) * 18
        return (
          <span
            key={i}
            style={{
              ['--i' as string]: i,
              ['--n' as string]: n,
              left: `${2 + r4 * 96}%`,
              animationDelay: `${-(r5 * 3.2)}s`,
              animationDuration: `${2.2 + r6 * 2.8}s`,
              ['--sz' as string]: `${size}`,
              ['--op' as string]: `${0.45 + r2 * 0.5}`,
              ['--sway' as string]: `${sway}px`,
              ['--spin' as string]: `${120 + r3 * 280}deg`,
            }}
          >
            {glyph === '❄' || glyph === '✦' ? (
              <i className="w3d-flake-dot" aria-hidden />
            ) : (
              glyph
            )}
          </span>
        )
      })}
    </div>
  )
}

/** Layered fog / smoke bands with independent drift. */
function FogLayers({
  kind = 'fog',
  layers = 5,
}: {
  kind?: 'fog' | 'smoke' | 'icy'
  layers?: number
}) {
  return (
    <div className={`w3d-fog w3d-fog-live ${kind === 'smoke' ? 'w3d-smoke' : ''} ${kind === 'icy' ? 'icy' : ''}`}>
      {Array.from({ length: layers }, (_, i) => {
        const r1 = dropRand(i, 21)
        const r2 = dropRand(i, 22)
        const r3 = dropRand(i, 23)
        return (
          <span
            key={i}
            style={{
              bottom: `${6 + i * (70 / layers) + r1 * 4}%`,
              height: `${10 + r2 * 10}%`,
              width: `${78 + r3 * 22}%`,
              marginLeft: `${r1 * 12}%`,
              animationDelay: `${-(r2 * 4)}s`,
              animationDuration: `${4.5 + r3 * 4}s`,
              opacity: 0.35 + r1 * 0.4,
              ['--fog-x' as string]: `${6 + r2 * 10}%`,
            }}
          />
        )
      })}
    </div>
  )
}

function Hail({ n = 10, windDrift = 0 }: { n?: number; windDrift?: number }) {
  return (
    <div className="w3d-hail">
      {Array.from({ length: n }, (_, i) => {
        const r1 = dropRand(i, 31)
        const r2 = dropRand(i, 32)
        const r3 = dropRand(i, 33)
        const r4 = dropRand(i, 34)
        return (
          <span
            key={i}
            style={{
              left: `${4 + r1 * 90}%`,
              animationDelay: `${-(r2 * 1.1)}s`,
              animationDuration: `${0.65 + r3 * 0.55}s`,
              width: `${3.5 + r4 * 4}px`,
              height: `${3.5 + r4 * 4}px`,
              ['--hail-x' as string]: `${windDrift * 0.4 + (r1 - 0.5) * 12}px`,
              ['--op' as string]: `${0.55 + r2 * 0.4}`,
            }}
          />
        )
      })}
    </div>
  )
}

function Bolt({
  hail = false,
  gradId,
  hero = false,
  windDrift = 0,
}: {
  hail?: boolean
  gradId: string
  hero?: boolean
  windDrift?: number
}) {
  return (
    <>
      <div className={`w3d-bolt${hero ? ' hero' : ''}`} style={{ left: `${36 + (windDrift > 0 ? 4 : -2)}%` }}>
        <svg viewBox="0 0 40 64" className="w3d-bolt-svg">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fffef5" />
              <stop offset="35%" stopColor="#fef08a" />
              <stop offset="70%" stopColor="#facc15" />
              <stop offset="100%" stopColor="#eab308" />
            </linearGradient>
          </defs>
          <path
            d="M22 2 L8 34 H20 L14 62 L36 28 H22 Z"
            fill={`url(#${gradId})`}
            stroke="#fffbeb"
            strokeWidth="1.2"
          />
        </svg>
      </div>
      {hero && (
        <div className="w3d-bolt secondary" style={{ left: '58%' }}>
          <svg viewBox="0 0 40 64" className="w3d-bolt-svg">
            <path
              d="M20 4 L10 30 H18 L12 56 L32 26 H20 Z"
              fill={`url(#${gradId})`}
              stroke="#fffbeb"
              strokeWidth="1"
              opacity="0.85"
            />
          </svg>
        </div>
      )}
      {hail && <Hail n={hero ? 14 : 8} windDrift={windDrift} />}
      <div className="w3d-flash" />
    </>
  )
}

export function WeatherIcon3D({
  code,
  isDay = true,
  size = 'md',
  className = '',
  /**
   * Full CSS animation. Default off — list icons (hourly/daily) stay static
   * for CPU; set true only for hero / “now” cards.
   */
  forceAnimate = false,
  windSpeed = null,
  windDir = null,
}: Props) {
  const uid = useId().replace(/:/g, '')
  const boltGradId = `boltGrad-${uid}`
  const { kind, intensity } = weatherKindFromCode(code, isDay)
  const wind = windVisual(windSpeed, windDir)
  /* Hero: denser lifelike particles; list icons stay lighter */
  const hero = forceAnimate && (size === 'lg' || size === 'xl')
  const dropCount = hero
    ? intensity === 1
      ? 22
      : intensity === 2
        ? 34
        : 48
    : intensity === 1
      ? 10
      : intensity === 2
        ? 16
        : 22
  const flakeCount = hero
    ? intensity === 1
      ? 18
      : intensity === 2
        ? 28
        : 40
    : intensity === 1
      ? 8
      : intensity === 2
        ? 12
        : 16
  const fogLayers = hero ? 7 : 5
  const dropProps = {
    windAng: wind.ang,
    windDrift: wind.drift,
  }

  const iconSrc = weatherIconSrc(kind)
  const liveFx = hero && weatherIconHasLiveFx(kind)

  /** HQ image base + optional live CSS particles for hero motion */
  const scene = (
    <>
      <img
        className="w3d-img"
        src={iconSrc}
        alt=""
        draggable={false}
        decoding="async"
        loading={size === 'sm' ? 'lazy' : 'eager'}
      />
      {liveFx && (
        <div className="w3d-live-fx" aria-hidden>
          {(kind === 'drizzle' ||
            kind === 'freezing-drizzle' ||
            kind === 'rain' ||
            kind === 'freezing-rain' ||
            kind === 'showers') && (
            <>
              <Drops
                n={Math.round(dropCount * 0.55)}
                className={`w3d-precip ${
                  kind.includes('drizzle') ? 'light' : intensity > 2 ? 'heavy' : 'med'
                }${kind.includes('freezing') ? ' icy' : ''}${kind === 'showers' ? ' shower' : ''}`}
                {...dropProps}
              />
              {intensity > 1 && <div className="w3d-splash" />}
            </>
          )}
          {(kind === 'snow' || kind === 'grains' || kind === 'snow-showers') && (
            <>
              <Flakes
                n={Math.round(flakeCount * 0.5)}
                glyph={kind === 'grains' ? '•' : '❄'}
                soft={kind === 'grains'}
                windDrift={wind.drift * 0.65}
              />
              {intensity > 2 && <div className="w3d-snow-ground" />}
            </>
          )}
          {(kind === 'thunder' || kind === 'thunder-hail') && (
            <>
              <Drops
                n={Math.round(dropCount * 0.4)}
                className="w3d-precip heavy"
                {...dropProps}
              />
              <Bolt
                hail={kind === 'thunder-hail'}
                gradId={boltGradId}
                hero={hero}
                windDrift={wind.drift}
              />
              <div className="w3d-flash" />
            </>
          )}
          {(kind === 'fog' || kind === 'rime' || kind === 'smoke') && (
            <FogLayers
              kind={kind === 'smoke' ? 'smoke' : kind === 'rime' ? 'icy' : 'fog'}
              layers={Math.min(fogLayers, 4)}
            />
          )}
          {kind === 'rime' && (
            <Flakes n={6} glyph="✦" soft windDrift={wind.drift * 0.3} />
          )}
        </div>
      )}
    </>
  )

  return (
    <div
      className={`w3d w3d-${size} w3d-${kind} w3d-i${intensity} w3d-photo ${forceAnimate ? 'w3d-force' : ''} ${className}`}
      aria-hidden
      data-kind={kind}
      data-intensity={intensity}
      style={
        {
          ['--w-ang']: `${wind.ang}deg`,
          ['--w-drift']: `${wind.drift}px`,
        } as CSSProperties
      }
    >
      <div className="w3d-stage">
        <div className="w3d-orbit">{scene}</div>
        <div className="w3d-floor" />
      </div>
    </div>
  )
}
