/**
 * Rough sky brightness from Bortle class ( mag/arcsec² ).
 * Not a meter reading — planning estimate only.
 */

const BORTLE_SQM: Record<number, number> = {
  1: 21.9,
  2: 21.7,
  3: 21.4,
  4: 20.9,
  5: 20.2,
  6: 19.2,
  7: 18.4,
  8: 17.8,
  9: 17.2,
}

export function sqmFromBortle(bortleClass: number): {
  sqm: number
  label: string
  mcd: number
} {
  const cls = Math.max(1, Math.min(9, Math.round(bortleClass)))
  const sqm = BORTLE_SQM[cls] ?? 20
  // Rough artificial brightness µcd/m² from SQM (order-of-magnitude)
  const mcd = Math.round(Math.pow(10, (22 - sqm) * 0.4) * 10) / 10
  return {
    sqm,
    label: `${sqm.toFixed(1)} mag/″² (est.)`,
    mcd,
  }
}
