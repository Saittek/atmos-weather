import { useId } from 'react'

/** Realistic phase moon with maria + craters */

interface Props {
  /** 0 = new, 0.5 = full, 1 = new again */
  phase: number
  size?: number
  className?: string
  title?: string
}

/** Shared lunar surface artwork (maria + craters + limb). */
function LunarSurface({ uid }: { uid: string }) {
  return (
    <g className="lunar-surface">
      <circle cx="50" cy="50" r="40" fill={`url(#${uid}-face)`} />

      {/* Soft highland grain */}
      <circle cx="50" cy="50" r="40" fill={`url(#${uid}-grain)`} opacity="0.35" />

      {/* Maria — dark basalt seas (near-side layout) */}
      <ellipse cx="36" cy="38" rx="16" ry="13" fill="rgba(55,52,48,0.42)" transform="rotate(-18 36 38)" />
      <ellipse cx="56" cy="40" rx="10" ry="9" fill="rgba(52,50,46,0.4)" />
      <ellipse cx="54" cy="58" rx="13" ry="11" fill="rgba(48,46,42,0.38)" transform="rotate(10 54 58)" />
      <ellipse cx="28" cy="56" rx="9" ry="12" fill="rgba(50,48,44,0.34)" transform="rotate(14 28 56)" />
      <ellipse cx="42" cy="48" rx="6" ry="5" fill="rgba(58,55,50,0.28)" />

      {/* Large basins / craters with raised rims */}
      <g fill="rgba(70,66,60,0.35)" stroke="rgba(230,224,210,0.28)" strokeWidth="0.9">
        <circle cx="52" cy="70" r="5.5" />
        <circle cx="63" cy="52" r="3.6" />
        <circle cx="38" cy="52" r="3.1" />
        <circle cx="67" cy="36" r="2.4" />
        <circle cx="34" cy="34" r="4.2" />
        <circle cx="72" cy="62" r="2.1" />
        <circle cx="46" cy="26" r="2" />
        <circle cx="42" cy="72" r="1.8" />
        <circle cx="58" cy="30" r="1.5" />
      </g>
      {/* Crater floors slightly darker */}
      <g fill="rgba(45,42,38,0.35)">
        <circle cx="52" cy="70" r="3.6" />
        <circle cx="34" cy="34" r="2.6" />
        <circle cx="63" cy="52" r="2.1" />
      </g>

      {/* Limb darkening */}
      <circle cx="50" cy="50" r="40" fill={`url(#${uid}-limb)`} />
      {/* Upper-left sun glint */}
      <ellipse cx="36" cy="34" rx="12" ry="10" fill="rgba(255,252,245,0.16)" />
    </g>
  )
}

function lunarDefs(uid: string) {
  return (
    <>
      <radialGradient id={`${uid}-face`} cx="34%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#f7f2e8" />
        <stop offset="28%" stopColor="#e4ddd0" />
        <stop offset="55%" stopColor="#c4bdb0" />
        <stop offset="82%" stopColor="#8f887c" />
        <stop offset="100%" stopColor="#5a554c" />
      </radialGradient>
      <radialGradient id={`${uid}-grain`} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="rgba(90,85,75,0)" />
        <stop offset="100%" stopColor="rgba(40,38,34,0.2)" />
      </radialGradient>
      <radialGradient id={`${uid}-limb`} cx="42%" cy="38%" r="58%">
        <stop offset="55%" stopColor="rgba(0,0,0,0)" />
        <stop offset="100%" stopColor="rgba(12,10,8,0.55)" />
      </radialGradient>
      <radialGradient id={`${uid}-glow`} cx="50%" cy="50%" r="50%">
        <stop offset="48%" stopColor="rgba(226,232,240,0.45)" />
        <stop offset="100%" stopColor="rgba(226,232,240,0)" />
      </radialGradient>
      <clipPath id={`${uid}-disk`}>
        <circle cx="50" cy="50" r="40" />
      </clipPath>
    </>
  )
}

/**
 * Orthographic-style phase: shadow disk slides across the lunar face.
 * phase 0 = new, 0.5 = full. Waxing lights the right; waning the left.
 */
export function MoonPhaseIcon({ phase, size = 56, className = '', title }: Props) {
  const uid = useId().replace(/:/g, '')
  const p = ((phase % 1) + 1) % 1
  const r = 40
  const cx = 50
  const cy = 50

  // Illuminated fraction 0–1
  const illum = (1 - Math.cos(p * Math.PI * 2)) / 2
  // Shadow center offset: 0 at new (covers all), 2r at full (off-disk)
  const dist = 2 * r * illum
  const darkCx = p <= 0.5 ? cx - dist : cx + dist

  return (
    <svg
      className={`moon-phase-icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={title ?? 'Moon phase'}
    >
      <defs>{lunarDefs(uid)}</defs>

      <circle cx={cx} cy={cy} r={48} fill={`url(#${uid}-glow)`} />

      {/* Unlit disk (visible at crescents / new) */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="#12141c"
        stroke="rgba(148,163,184,0.25)"
        strokeWidth="1"
      />

      {/* Lit surface */}
      <g clipPath={`url(#${uid}-disk)`}>
        <LunarSurface uid={uid} />
        {/* Night side overlay — same-radius disk carves the phase */}
        {illum < 0.995 && (
          <circle cx={darkCx} cy={cy} r={r + 0.2} fill="#0a0c12" />
        )}
      </g>

      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="rgba(255,252,245,0.22)"
        strokeWidth="1.2"
      />
    </svg>
  )
}
