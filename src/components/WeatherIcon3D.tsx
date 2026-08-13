import { useId, type CSSProperties } from 'react'
import { windVisual } from '../utils/windVisual'
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

function Clouds({ dark = false, storm = false }: { dark?: boolean; storm?: boolean }) {
  return (
    <div className={`w3d-clouds ${dark ? 'dark' : ''} ${storm ? 'storm' : ''}`}>
      {/* Layered 3D cumulus: far → mid → near with independent bob */}
      <span className="w3d-cloud back">
        <i className="w3d-puff a" />
        <i className="w3d-puff b" />
        <i className="w3d-puff c" />
      </span>
      <span className="w3d-cloud mid">
        <i className="w3d-puff a" />
        <i className="w3d-puff b" />
        <i className="w3d-puff c" />
        <i className="w3d-puff d" />
      </span>
      <span className="w3d-cloud front">
        <i className="w3d-puff a" />
        <i className="w3d-puff b" />
        <i className="w3d-puff c" />
        <i className="w3d-puff d" />
        <i className="w3d-puff e" />
      </span>
      {storm && <span className="w3d-cloud storm-cap" aria-hidden />}
    </div>
  )
}

function Sun({ small = false }: { small?: boolean }) {
  const uid = useId().replace(/:/g, '')
  // 12 major + 12 minor rays for denser 3D corona
  const major = Array.from({ length: 12 }, (_, i) => i * 30)
  const minor = Array.from({ length: 12 }, (_, i) => i * 30 + 15)

  return (
    <div className={`w3d-sun ${small ? 'small' : ''}`}>
      {/* Depth glow plates behind disc */}
      <span className="w3d-sun-aura" aria-hidden />
      <span className="w3d-sun-halo" aria-hidden />
      <svg className="w3d-sun-svg" viewBox="0 0 100 100" aria-hidden>
        <defs>
          <radialGradient id={`${uid}-core`} cx="32%" cy="28%" r="70%">
            <stop offset="0%" stopColor="#fffef8" />
            <stop offset="14%" stopColor="#fef9c3" />
            <stop offset="36%" stopColor="#fde047" />
            <stop offset="62%" stopColor="#fbbf24" />
            <stop offset="86%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#b45309" />
          </radialGradient>
          <radialGradient id={`${uid}-limb`} cx="38%" cy="34%" r="64%">
            <stop offset="48%" stopColor="rgba(180,83,9,0)" />
            <stop offset="78%" stopColor="rgba(180,83,9,0.22)" />
            <stop offset="100%" stopColor="rgba(120,53,15,0.55)" />
          </radialGradient>
          <radialGradient id={`${uid}-glow`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,251,235,0.95)" />
            <stop offset="28%" stopColor="rgba(253,224,71,0.55)" />
            <stop offset="58%" stopColor="rgba(251,191,36,0.22)" />
            <stop offset="100%" stopColor="rgba(251,191,36,0)" />
          </radialGradient>
          <linearGradient id={`${uid}-ray`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="rgba(253,224,71,0)" />
            <stop offset="30%" stopColor="rgba(253,224,71,0.9)" />
            <stop offset="72%" stopColor="rgba(254,243,199,0.98)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.45)" />
          </linearGradient>
          <filter id={`${uid}-blur`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.1" />
          </filter>
        </defs>

        <circle className="w3d-sun-corona" cx="50" cy="50" r="48" fill={`url(#${uid}-glow)`} />

        <g className="w3d-sun-rays">
          {major.map((deg) => (
            <path
              key={`m${deg}`}
              className="w3d-sun-ray major"
              d="M50 5 L53.6 27 L50 31.5 L46.4 27 Z"
              fill={`url(#${uid}-ray)`}
              transform={`rotate(${deg} 50 50)`}
            />
          ))}
          {minor.map((deg) => (
            <path
              key={`n${deg}`}
              className="w3d-sun-ray minor"
              d="M50 12 L51.9 29 L50 32.5 L48.1 29 Z"
              fill={`url(#${uid}-ray)`}
              opacity="0.62"
              transform={`rotate(${deg} 50 50)`}
            />
          ))}
        </g>

        {/* Sphere: core + surface + limb darkening */}
        <circle className="w3d-sun-disc" cx="50" cy="50" r="23" fill={`url(#${uid}-core)`} />
        <g className="w3d-sun-surface" opacity="0.4" filter={`url(#${uid}-blur)`}>
          <ellipse cx="41" cy="40" rx="7" ry="5.5" fill="rgba(255,255,255,0.6)" />
          <ellipse cx="58" cy="47" rx="4.5" ry="3.5" fill="rgba(255,251,235,0.45)" />
          <ellipse cx="48" cy="58" rx="5.5" ry="3.2" fill="rgba(245,158,11,0.38)" />
          <ellipse cx="55" cy="38" rx="3" ry="2.2" fill="rgba(255,255,255,0.35)" />
        </g>
        <ellipse cx="61" cy="55" rx="2.4" ry="1.7" fill="rgba(146,64,14,0.32)" />
        <ellipse cx="39" cy="53" rx="1.6" ry="1.2" fill="rgba(146,64,14,0.26)" />
        <circle cx="50" cy="50" r="23" fill={`url(#${uid}-limb)`} />
        <circle
          cx="50"
          cy="50"
          r="23"
          fill="none"
          stroke="rgba(255,251,235,0.6)"
          strokeWidth="1.15"
        />
        <ellipse cx="41" cy="39" rx="9" ry="6.5" fill="rgba(255,255,255,0.28)" />
      </svg>
    </div>
  )
}

function MoonFace({ peep = false }: { peep?: boolean }) {
  const uid = useId().replace(/:/g, '')
  return (
    <div className={`w3d-moon ${peep ? 'peep' : ''}`}>
      {!peep && (
        <>
          <span className="w3d-moon-aura" aria-hidden />
          <span className="w3d-star s1" />
          <span className="w3d-star s2" />
          <span className="w3d-star s3" />
          <span className="w3d-star s4" />
          <span className="w3d-star s5" />
          <span className="w3d-star s6" />
        </>
      )}
      <svg className="w3d-moon-svg" viewBox="0 0 100 100" aria-hidden>
        <defs>
          <radialGradient id={`${uid}-face`} cx="30%" cy="26%" r="74%">
            <stop offset="0%" stopColor="#fcf8f0" />
            <stop offset="18%" stopColor="#ebe4d6" />
            <stop offset="42%" stopColor="#c9c2b3" />
            <stop offset="70%" stopColor="#8a8376" />
            <stop offset="100%" stopColor="#3d3832" />
          </radialGradient>
          <radialGradient id={`${uid}-glow`} cx="50%" cy="50%" r="50%">
            <stop offset="30%" stopColor="rgba(191,219,254,0.55)" />
            <stop offset="70%" stopColor="rgba(226,232,240,0.18)" />
            <stop offset="100%" stopColor="rgba(226,232,240,0)" />
          </radialGradient>
          <radialGradient id={`${uid}-limb`} cx="36%" cy="32%" r="64%">
            <stop offset="45%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(8,10,18,0.62)" />
          </radialGradient>
          <radialGradient id={`${uid}-shade`} cx="100%" cy="48%" r="72%">
            <stop offset="0%" stopColor="rgba(8,10,18,0.62)" />
            <stop offset="50%" stopColor="rgba(8,10,18,0.14)" />
            <stop offset="100%" stopColor="rgba(8,10,18,0)" />
          </radialGradient>
          <filter id={`${uid}-soft`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.4" />
          </filter>
        </defs>

        {!peep && <circle cx="50" cy="50" r="48" fill={`url(#${uid}-glow)`} />}

        <circle cx="50" cy="50" r="38" fill={`url(#${uid}-face)`} />

        <g filter={`url(#${uid}-soft)`} fill="rgba(58,54,48,0.42)">
          <ellipse cx="38" cy="40" rx="15" ry="12" transform="rotate(-16 38 40)" />
          <ellipse cx="56" cy="42" rx="10" ry="9" />
          <ellipse cx="54" cy="58" rx="13" ry="11" transform="rotate(8 54 58)" />
          <ellipse cx="30" cy="56" rx="9" ry="12" transform="rotate(12 30 56)" />
        </g>

        <g stroke="rgba(235,228,215,0.38)" strokeWidth="0.85" fill="rgba(75,70,62,0.34)">
          <circle cx="52" cy="68" r="5.8" />
          <circle cx="64" cy="50" r="3.8" />
          <circle cx="38" cy="50" r="3.2" />
          <circle cx="68" cy="36" r="2.5" />
          <circle cx="34" cy="34" r="4.5" />
          <circle cx="72" cy="60" r="2.2" />
          <circle cx="46" cy="28" r="2.1" />
          <circle cx="42" cy="70" r="1.9" />
          <circle cx="58" cy="32" r="1.6" />
        </g>
        <g fill="rgba(40,38,34,0.4)">
          <circle cx="52" cy="68" r="3.8" />
          <circle cx="34" cy="34" r="2.8" />
          <circle cx="64" cy="50" r="2.2" />
        </g>

        <g stroke="rgba(245,240,230,0.14)" strokeWidth="0.6" fill="none">
          <line x1="52" y1="68" x2="38" y2="48" />
          <line x1="52" y1="68" x2="70" y2="52" />
          <line x1="52" y1="68" x2="58" y2="40" />
        </g>

        <circle cx="50" cy="50" r="38" fill={`url(#${uid}-limb)`} />
        <circle cx="50" cy="50" r="38" fill={`url(#${uid}-shade)`} />
        <ellipse cx="37" cy="35" rx="12" ry="9.5" fill="rgba(255,252,245,0.16)" />
        <circle
          cx="50"
          cy="50"
          r="38"
          fill="none"
          stroke="rgba(226,232,240,0.28)"
          strokeWidth="1.15"
        />
      </svg>
    </div>
  )
}

function Moon() {
  return <MoonFace />
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

  const scene = (() => {
    switch (kind) {
      case 'clear-day':
        return <Sun />
      case 'clear-night':
        return <Moon />
      case 'mostly-day':
        return (
          <>
            <Sun small />
            <div className="w3d-clouds thin">
              <span className="w3d-cloud front alone">
                <i className="w3d-puff a" />
                <i className="w3d-puff b" />
                <i className="w3d-puff c" />
              </span>
            </div>
          </>
        )
      case 'mostly-night':
        return (
          <>
            <Moon />
            <div className="w3d-clouds thin">
              <span className="w3d-cloud front alone">
                <i className="w3d-puff a" />
                <i className="w3d-puff b" />
                <i className="w3d-puff c" />
              </span>
            </div>
          </>
        )
      case 'partly-day':
        return (
          <>
            <Sun small />
            <Clouds />
          </>
        )
      case 'partly-night':
        return (
          <>
            <MoonFace peep />
            <Clouds />
          </>
        )
      case 'overcast':
        return <Clouds dark />
      case 'fog':
        return (
          <>
            <Clouds dark />
            <FogLayers kind="fog" layers={fogLayers} />
          </>
        )
      case 'smoke':
        return (
          <>
            <Clouds dark />
            <FogLayers kind="smoke" layers={fogLayers} />
          </>
        )
      case 'rime':
        return (
          <>
            <Clouds dark />
            <FogLayers kind="icy" layers={hero ? 6 : 4} />
            <Flakes n={hero ? 10 : 5} glyph="✦" soft windDrift={wind.drift * 0.3} />
          </>
        )
      case 'drizzle':
        return (
          <>
            <Clouds />
            <Drops n={dropCount} className="w3d-precip light" {...dropProps} />
            {hero && <div className="w3d-splash" />}
          </>
        )
      case 'freezing-drizzle':
        return (
          <>
            <Clouds dark />
            <Drops n={dropCount} className="w3d-precip light icy" {...dropProps} />
            <Flakes n={hero ? 8 : 4} glyph="·" soft windDrift={wind.drift * 0.4} />
          </>
        )
      case 'rain':
        return (
          <>
            <Clouds dark={intensity > 1} />
            <Drops
              n={dropCount}
              className={`w3d-precip ${intensity > 2 ? 'heavy' : 'med'}`}
              {...dropProps}
            />
            {(intensity > 1 || hero) && <div className="w3d-splash" />}
          </>
        )
      case 'freezing-rain':
        return (
          <>
            <Clouds dark />
            <Drops n={dropCount} className="w3d-precip med icy" {...dropProps} />
            <div className="w3d-ice-glaze" />
            {hero && <div className="w3d-splash" />}
          </>
        )
      case 'snow':
        return (
          <>
            <Clouds dark={intensity > 1} />
            <Flakes n={flakeCount} windDrift={wind.drift * 0.7} />
            {(intensity > 2 || hero) && <div className="w3d-snow-ground" />}
          </>
        )
      case 'grains':
        return (
          <>
            <Clouds dark />
            <Flakes n={hero ? 16 : 10} glyph="•" soft windDrift={wind.drift * 0.5} />
          </>
        )
      case 'showers':
        return (
          <>
            <Sun small />
            <Clouds />
            <Drops
              n={dropCount}
              className={`w3d-precip shower ${intensity > 2 ? 'heavy' : 'med'}`}
              {...dropProps}
            />
            {(intensity > 1 || hero) && <div className="w3d-splash" />}
          </>
        )
      case 'snow-showers':
        return (
          <>
            <Sun small />
            <Clouds />
            <Flakes n={flakeCount} windDrift={wind.drift * 0.7} />
          </>
        )
      case 'thunder':
        return (
          <>
            <Clouds dark storm />
            <Drops n={Math.max(dropCount, hero ? 36 : 16)} className="w3d-precip heavy" {...dropProps} />
            <div className="w3d-splash" />
            <Bolt gradId={boltGradId} hero={hero} windDrift={wind.drift} />
          </>
        )
      case 'thunder-hail':
        return (
          <>
            <Clouds dark storm />
            <Drops n={Math.max(dropCount, hero ? 30 : 14)} className="w3d-precip heavy" {...dropProps} />
            <div className="w3d-splash" />
            <Bolt hail gradId={boltGradId} hero={hero} windDrift={wind.drift} />
          </>
        )
      default:
        return <Sun />
    }
  })()

  return (
    <div
      className={`w3d w3d-${size} w3d-${kind} w3d-i${intensity} ${forceAnimate ? 'w3d-force' : ''} ${className}`}
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
