/** Rain vs snow classification for precip UI */

export type PrecipKind = 'dry' | 'rain' | 'snow' | 'mix'

function isSnowCode(code: number): boolean {
  return (
    (code >= 71 && code <= 77) ||
    code === 85 ||
    code === 86 ||
    code === 56 ||
    code === 57 ||
    code === 66 ||
    code === 67
  )
}

function isRainCode(code: number): boolean {
  return (
    (code >= 51 && code <= 67) ||
    (code >= 80 && code <= 82) ||
    code === 95 ||
    code === 96 ||
    code === 99
  )
}

export function resolvePrecipKind(
  tempC: number | null | undefined,
  weatherCode: number | null | undefined,
  hasPrecip: boolean,
): PrecipKind {
  if (!hasPrecip) return 'dry'
  const code = weatherCode ?? -1
  if (isSnowCode(code)) return 'snow'
  if (tempC != null && tempC <= 0.5 && (isRainCode(code) || code < 0)) {
    if (tempC <= -0.5) return 'snow'
    return 'mix'
  }
  if (tempC != null && tempC <= 1.5 && isSnowCode(code)) return 'snow'
  if (tempC != null && tempC <= 0) return 'snow'
  return 'rain'
}
