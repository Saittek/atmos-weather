/**
 * High-quality 3D weather icon images (public/weather/icons).
 * Solid navy backgrounds for dark Solara glass UI.
 */

/** Keep in sync with WeatherIcon3D.Weather3DKind */
export type WeatherAssetKind =
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

const BASE = '/weather/icons'

export const WEATHER_ICON_FILES = {
  sun: `${BASE}/sun.jpg`,
  moon: `${BASE}/moon.jpg`,
  cloud: `${BASE}/cloud.jpg`,
  cloudDark: `${BASE}/cloud-dark.jpg`,
  rain: `${BASE}/rain.jpg`,
  snow: `${BASE}/snow.jpg`,
  thunder: `${BASE}/thunder.jpg`,
  fog: `${BASE}/fog.jpg`,
  smoke: `${BASE}/smoke.jpg`,
  partlyDay: `${BASE}/partly-day.jpg`,
  partlyNight: `${BASE}/partly-night.jpg`,
  storm: `${BASE}/storm.jpg`,
} as const

/** Map each animated 3D kind to a primary HQ asset. */
export function weatherIconSrc(kind: WeatherAssetKind): string {
  switch (kind) {
    case 'clear-day':
      return WEATHER_ICON_FILES.sun
    case 'clear-night':
      return WEATHER_ICON_FILES.moon
    case 'mostly-day':
    case 'partly-day':
      return WEATHER_ICON_FILES.partlyDay
    case 'mostly-night':
    case 'partly-night':
      return WEATHER_ICON_FILES.partlyNight
    case 'overcast':
      return WEATHER_ICON_FILES.cloudDark
    case 'fog':
    case 'rime':
      return WEATHER_ICON_FILES.fog
    case 'smoke':
      return WEATHER_ICON_FILES.smoke
    case 'drizzle':
    case 'freezing-drizzle':
    case 'rain':
    case 'freezing-rain':
    case 'showers':
      return WEATHER_ICON_FILES.rain
    case 'snow':
    case 'grains':
    case 'snow-showers':
      return WEATHER_ICON_FILES.snow
    case 'thunder':
    case 'thunder-hail':
      return WEATHER_ICON_FILES.thunder
    default:
      return WEATHER_ICON_FILES.partlyDay
  }
}

/** Kinds that benefit from live CSS particle overlays on top of the image (hero only). */
export function weatherIconHasLiveFx(kind: WeatherAssetKind): boolean {
  return (
    kind === 'drizzle' ||
    kind === 'freezing-drizzle' ||
    kind === 'rain' ||
    kind === 'freezing-rain' ||
    kind === 'showers' ||
    kind === 'snow' ||
    kind === 'grains' ||
    kind === 'snow-showers' ||
    kind === 'thunder' ||
    kind === 'thunder-hail' ||
    kind === 'fog' ||
    kind === 'smoke' ||
    kind === 'rime'
  )
}
