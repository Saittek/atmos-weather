import { useEffect, useId, useState } from 'react'
import './weather-3d.css'

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
}

export function weatherKindFromCode(
  code: number,
  isDay = true,
): { kind: Weather3DKind; intensity: Weather3DIntensity } {
  if (code === 0) return { kind: isDay ? 'clear-day' : 'clear-night', intensity: 1 }
  if (code === 1) return { kind: isDay ? 'mostly-day' : 'mostly-night', intensity: 1 }
  if (code === 2) return { kind: isDay ? 'partly-day' : 'partly-night', intensity: 1 }
  if (code === 3) return { kind: 'overcast', intensity: 2 }
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

function Drops({ n, className }: { n: number; className?: string }) {
  return (
    <div className={className}>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} style={{ ['--i' as string]: i, ['--n' as string]: n }} />
      ))}
    </div>
  )
}

function Flakes({ n, glyph = '❄' }: { n: number; glyph?: string }) {
  return (
    <div className="w3d-snow">
      {Array.from({ length: n }, (_, i) => (
        <span key={i} style={{ ['--i' as string]: i, ['--n' as string]: n }}>
          {glyph}
        </span>
      ))}
    </div>
  )
}

function Clouds({ dark = false, storm = false }: { dark?: boolean; storm?: boolean }) {
  return (
    <div className={`w3d-clouds ${dark ? 'dark' : ''} ${storm ? 'storm' : ''}`}>
      <span className="w3d-cloud back" />
      <span className="w3d-cloud mid" />
      <span className="w3d-cloud front" />
    </div>
  )
}

function Sun({ small = false }: { small?: boolean }) {
  const uid = useId().replace(/:/g, '')
  // Classic 8 major + 8 minor rays
  const major = Array.from({ length: 8 }, (_, i) => i * 45)
  const minor = Array.from({ length: 8 }, (_, i) => i * 45 + 22.5)

  return (
    <div className={`w3d-sun ${small ? 'small' : ''}`}>
      <svg className="w3d-sun-svg" viewBox="0 0 100 100" aria-hidden>
        <defs>
          <radialGradient id={`${uid}-core`} cx="34%" cy="30%" r="68%">
            <stop offset="0%" stopColor="#fffef5" />
            <stop offset="18%" stopColor="#fef9c3" />
            <stop offset="42%" stopColor="#fde047" />
            <stop offset="70%" stopColor="#fbbf24" />
            <stop offset="92%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#d97706" />
          </radialGradient>
          <radialGradient id={`${uid}-limb`} cx="40%" cy="36%" r="62%">
            <stop offset="55%" stopColor="rgba(180,83,9,0)" />
            <stop offset="100%" stopColor="rgba(146,64,14,0.45)" />
          </radialGradient>
          <radialGradient id={`${uid}-glow`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(254,243,199,0.85)" />
            <stop offset="35%" stopColor="rgba(253,224,71,0.45)" />
            <stop offset="70%" stopColor="rgba(251,191,36,0.18)" />
            <stop offset="100%" stopColor="rgba(251,191,36,0)" />
          </radialGradient>
          <linearGradient id={`${uid}-ray`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="rgba(253,224,71,0)" />
            <stop offset="35%" stopColor="rgba(253,224,71,0.85)" />
            <stop offset="75%" stopColor="rgba(254,243,199,0.95)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.35)" />
          </linearGradient>
          <filter id={`${uid}-blur`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" />
          </filter>
        </defs>

        {/* Soft corona */}
        <circle className="w3d-sun-corona" cx="50" cy="50" r="48" fill={`url(#${uid}-glow)`} />

        {/* Rays — rotate as a group, disc stays still */}
        <g className="w3d-sun-rays">
          {major.map((deg) => (
            <path
              key={`m${deg}`}
              className="w3d-sun-ray major"
              d="M50 8 L53.2 28 L50 32 L46.8 28 Z"
              fill={`url(#${uid}-ray)`}
              transform={`rotate(${deg} 50 50)`}
            />
          ))}
          {minor.map((deg) => (
            <path
              key={`n${deg}`}
              className="w3d-sun-ray minor"
              d="M50 14 L51.8 30 L50 33 L48.2 30 Z"
              fill={`url(#${uid}-ray)`}
              opacity="0.65"
              transform={`rotate(${deg} 50 50)`}
            />
          ))}
        </g>

        {/* Photosphere */}
        <circle className="w3d-sun-disc" cx="50" cy="50" r="22" fill={`url(#${uid}-core)`} />
        {/* Subtle granulation / hot spots */}
        <g className="w3d-sun-surface" opacity="0.35" filter={`url(#${uid}-blur)`}>
          <ellipse cx="42" cy="42" rx="6" ry="5" fill="rgba(255,255,255,0.55)" />
          <ellipse cx="58" cy="48" rx="4" ry="3.5" fill="rgba(255,251,235,0.4)" />
          <ellipse cx="48" cy="58" rx="5" ry="3" fill="rgba(245,158,11,0.35)" />
        </g>
        {/* Soft sunspot suggestion */}
        <ellipse cx="60" cy="56" rx="2.2" ry="1.6" fill="rgba(180,83,9,0.28)" />
        <ellipse cx="40" cy="52" rx="1.4" ry="1.1" fill="rgba(180,83,9,0.22)" />
        <circle cx="50" cy="50" r="22" fill={`url(#${uid}-limb)`} />
        {/* Bright rim glint */}
        <circle
          cx="50"
          cy="50"
          r="22"
          fill="none"
          stroke="rgba(255,251,235,0.55)"
          strokeWidth="1.2"
        />
        <ellipse cx="42" cy="40" rx="8" ry="6" fill="rgba(255,255,255,0.22)" />
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
          <span className="w3d-star s1" />
          <span className="w3d-star s2" />
          <span className="w3d-star s3" />
          <span className="w3d-star s4" />
          <span className="w3d-star s5" />
        </>
      )}
      <svg className="w3d-moon-svg" viewBox="0 0 100 100" aria-hidden>
        <defs>
          <radialGradient id={`${uid}-face`} cx="32%" cy="28%" r="72%">
            <stop offset="0%" stopColor="#faf6ee" />
            <stop offset="22%" stopColor="#ebe4d6" />
            <stop offset="48%" stopColor="#c9c2b3" />
            <stop offset="75%" stopColor="#90897c" />
            <stop offset="100%" stopColor="#4a453e" />
          </radialGradient>
          <radialGradient id={`${uid}-glow`} cx="50%" cy="50%" r="50%">
            <stop offset="40%" stopColor="rgba(226,232,240,0.5)" />
            <stop offset="100%" stopColor="rgba(226,232,240,0)" />
          </radialGradient>
          <radialGradient id={`${uid}-limb`} cx="38%" cy="34%" r="62%">
            <stop offset="50%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(10,8,6,0.55)" />
          </radialGradient>
          <radialGradient id={`${uid}-shade`} cx="100%" cy="50%" r="70%">
            <stop offset="0%" stopColor="rgba(8,10,18,0.55)" />
            <stop offset="55%" stopColor="rgba(8,10,18,0.12)" />
            <stop offset="100%" stopColor="rgba(8,10,18,0)" />
          </radialGradient>
          <filter id={`${uid}-soft`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.35" />
          </filter>
        </defs>

        {!peep && <circle cx="50" cy="50" r="48" fill={`url(#${uid}-glow)`} />}

        {/* Disk */}
        <circle cx="50" cy="50" r="38" fill={`url(#${uid}-face)`} />

        {/* Maria */}
        <g filter={`url(#${uid}-soft)`} fill="rgba(58,54,48,0.4)">
          <ellipse cx="38" cy="40" rx="15" ry="12" transform="rotate(-16 38 40)" />
          <ellipse cx="56" cy="42" rx="10" ry="9" />
          <ellipse cx="54" cy="58" rx="13" ry="11" transform="rotate(8 54 58)" />
          <ellipse cx="30" cy="56" rx="9" ry="12" transform="rotate(12 30 56)" />
        </g>

        {/* Craters — rim + floor */}
        <g stroke="rgba(235,228,215,0.35)" strokeWidth="0.85" fill="rgba(75,70,62,0.32)">
          <circle cx="52" cy="68" r="5.8" />
          <circle cx="64" cy="50" r="3.8" />
          <circle cx="38" cy="50" r="3.2" />
          <circle cx="68" cy="36" r="2.5" />
          <circle cx="34" cy="34" r="4.5" />
          <circle cx="72" cy="60" r="2.2" />
          <circle cx="46" cy="28" r="2.1" />
          <circle cx="42" cy="70" r="1.9" />
        </g>
        <g fill="rgba(40,38,34,0.38)">
          <circle cx="52" cy="68" r="3.8" />
          <circle cx="34" cy="34" r="2.8" />
          <circle cx="64" cy="50" r="2.2" />
        </g>

        {/* Bright ray hint near Tycho */}
        <g stroke="rgba(245,240,230,0.12)" strokeWidth="0.6" fill="none">
          <line x1="52" y1="68" x2="38" y2="48" />
          <line x1="52" y1="68" x2="70" y2="52" />
          <line x1="52" y1="68" x2="58" y2="40" />
        </g>

        <circle cx="50" cy="50" r="38" fill={`url(#${uid}-limb)`} />
        <circle cx="50" cy="50" r="38" fill={`url(#${uid}-shade)`} />
        <ellipse cx="38" cy="36" rx="11" ry="9" fill="rgba(255,252,245,0.14)" />
        <circle
          cx="50"
          cy="50"
          r="38"
          fill="none"
          stroke="rgba(255,252,245,0.2)"
          strokeWidth="1.1"
        />
      </svg>
    </div>
  )
}

function Moon() {
  return <MoonFace />
}

function Bolt({ hail = false, gradId }: { hail?: boolean; gradId: string }) {
  return (
    <>
      <div className="w3d-bolt">
        <svg viewBox="0 0 40 64" className="w3d-bolt-svg">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fef9c3" />
              <stop offset="55%" stopColor="#fde047" />
              <stop offset="100%" stopColor="#f59e0b" />
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
      {hail && (
        <div className="w3d-hail">
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} style={{ ['--i' as string]: i }} />
          ))}
        </div>
      )}
      <div className="w3d-flash" />
    </>
  )
}

export function WeatherIcon3D({
  code,
  isDay = true,
  size = 'md',
  className = '',
  /** Keep CSS animations running (default on for lively icons) */
  forceAnimate = true,
}: Props) {
  const uid = useId().replace(/:/g, '')
  const boltGradId = `boltGrad-${uid}`
  const { kind, intensity } = weatherKindFromCode(code, isDay)
  const dropCount = intensity === 1 ? 6 : intensity === 2 ? 10 : 14
  const flakeCount = intensity === 1 ? 7 : intensity === 2 ? 11 : 15
  /** Remount key so animations restart after tab sleep / every few cycles */
  const [animGen, setAnimGen] = useState(0)

  useEffect(() => {
    // Restart motion periodically so loops don’t freeze after long idle
    const every = size === 'sm' ? 12_000 : 8_000
    const id = window.setInterval(() => setAnimGen((g) => g + 1), every)
    const onVis = () => {
      if (document.visibilityState === 'visible') setAnimGen((g) => g + 1)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [size, code, isDay])

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
              <span className="w3d-cloud front alone" />
            </div>
          </>
        )
      case 'mostly-night':
        return (
          <>
            <Moon />
            <div className="w3d-clouds thin">
              <span className="w3d-cloud front alone" />
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
            <div className="w3d-fog">
              <span />
              <span />
              <span />
              <span />
            </div>
          </>
        )
      case 'rime':
        return (
          <>
            <Clouds dark />
            <div className="w3d-fog icy">
              <span />
              <span />
              <span />
            </div>
            <Flakes n={5} glyph="✦" />
          </>
        )
      case 'drizzle':
        return (
          <>
            <Clouds />
            <Drops n={dropCount} className="w3d-precip light" />
          </>
        )
      case 'freezing-drizzle':
        return (
          <>
            <Clouds dark />
            <Drops n={dropCount} className="w3d-precip light icy" />
            <Flakes n={4} glyph="·" />
          </>
        )
      case 'rain':
        return (
          <>
            <Clouds dark={intensity > 1} />
            <Drops n={dropCount} className={`w3d-precip ${intensity > 2 ? 'heavy' : 'med'}`} />
            {intensity > 2 && <div className="w3d-splash" />}
          </>
        )
      case 'freezing-rain':
        return (
          <>
            <Clouds dark />
            <Drops n={dropCount} className="w3d-precip med icy" />
            <div className="w3d-ice-glaze" />
          </>
        )
      case 'snow':
        return (
          <>
            <Clouds dark={intensity > 1} />
            <Flakes n={flakeCount} />
            {intensity > 2 && <div className="w3d-snow-ground" />}
          </>
        )
      case 'grains':
        return (
          <>
            <Clouds dark />
            <Flakes n={10} glyph="•" />
          </>
        )
      case 'showers':
        return (
          <>
            <Sun small />
            <Clouds />
            <Drops n={dropCount} className={`w3d-precip shower ${intensity > 2 ? 'heavy' : 'med'}`} />
          </>
        )
      case 'snow-showers':
        return (
          <>
            <Sun small />
            <Clouds />
            <Flakes n={flakeCount} />
          </>
        )
      case 'thunder':
        return (
          <>
            <Clouds dark storm />
            <Drops n={8} className="w3d-precip heavy" />
            <Bolt gradId={boltGradId} />
          </>
        )
      case 'thunder-hail':
        return (
          <>
            <Clouds dark storm />
            <Drops n={6} className="w3d-precip heavy" />
            <Bolt hail gradId={boltGradId} />
          </>
        )
      default:
        return <Sun />
    }
  })()

  return (
    <div
      key={`${kind}-${isDay ? 1 : 0}-${animGen}`}
      className={`w3d w3d-${size} w3d-${kind} w3d-i${intensity} ${forceAnimate ? 'w3d-force' : ''} ${className}`}
      aria-hidden
      data-kind={kind}
      data-intensity={intensity}
    >
      <div className="w3d-stage">
        <div className="w3d-orbit">{scene}</div>
        <div className="w3d-floor" />
      </div>
    </div>
  )
}
