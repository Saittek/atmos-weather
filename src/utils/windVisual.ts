/** Map wind to streak lean + horizontal drift (screen space). */
export function windVisual(
  speed: number | null | undefined,
  dirDeg: number | null | undefined,
): { ang: number; drift: number; strength: number } {
  const sp = Math.max(0, speed ?? 0)
  const dir = dirDeg ?? 270
  // Wind FROM dir → blow eastward component (positive = to the right)
  const blowEast = -Math.sin((dir * Math.PI) / 180)
  const strength = Math.min(1, sp / 45)
  const lean = 7 + strength * 16
  const ang = lean * (Math.abs(blowEast) < 0.15 ? 0.35 : blowEast >= 0 ? 1 : -1)
  const drift = blowEast * (5 + strength * 22)
  return { ang, drift, strength }
}
