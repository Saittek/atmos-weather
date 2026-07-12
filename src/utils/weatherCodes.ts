export interface WeatherInfo {
  label: string
  icon: string
  description: string
  gradient: string
}

/** WMO weather interpretation codes (Open-Meteo) */
export function getWeatherInfo(code: number, isDay = true): WeatherInfo {
  const night = !isDay

  const map: Record<number, WeatherInfo> = {
    0: {
      label: 'Clear',
      icon: night ? '🌙' : '☀️',
      description: 'Clear sky',
      gradient: night
        ? 'linear-gradient(160deg, #0b1220 0%, #1a2744 50%, #0f1a30 100%)'
        : 'linear-gradient(160deg, #1a6bb5 0%, #3d9ee5 45%, #7ec8f5 100%)',
    },
    1: {
      label: 'Mostly Clear',
      icon: night ? '🌙' : '🌤️',
      description: 'Mainly clear',
      gradient: night
        ? 'linear-gradient(160deg, #0b1220 0%, #1e2d4a 50%, #152238 100%)'
        : 'linear-gradient(160deg, #1f6fad 0%, #4aa3d9 50%, #89c6ef 100%)',
    },
    2: {
      label: 'Partly Cloudy',
      icon: night ? '☁️' : '⛅',
      description: 'Partly cloudy',
      gradient: night
        ? 'linear-gradient(160deg, #101820 0%, #243044 55%, #1a2535 100%)'
        : 'linear-gradient(160deg, #3d6f99 0%, #6a9fc4 50%, #9bbfd9 100%)',
    },
    3: {
      label: 'Overcast',
      icon: '☁️',
      description: 'Overcast',
      gradient: 'linear-gradient(160deg, #2a3340 0%, #4a5568 50%, #3d4654 100%)',
    },
    45: {
      label: 'Foggy',
      icon: '🌫️',
      description: 'Fog',
      gradient: 'linear-gradient(160deg, #4a5560 0%, #6b7885 50%, #5a6670 100%)',
    },
    48: {
      label: 'Icy Fog',
      icon: '🌫️',
      description: 'Depositing rime fog',
      gradient: 'linear-gradient(160deg, #3d4a55 0%, #5c6b78 50%, #4a5865 100%)',
    },
    51: {
      label: 'Light Drizzle',
      icon: '🌦️',
      description: 'Light drizzle',
      gradient: 'linear-gradient(160deg, #2c3e50 0%, #3d5a73 50%, #2f4a60 100%)',
    },
    53: {
      label: 'Drizzle',
      icon: '🌦️',
      description: 'Moderate drizzle',
      gradient: 'linear-gradient(160deg, #243746 0%, #355a72 50%, #2a475c 100%)',
    },
    55: {
      label: 'Heavy Drizzle',
      icon: '🌧️',
      description: 'Dense drizzle',
      gradient: 'linear-gradient(160deg, #1e3040 0%, #2f4f66 50%, #243d52 100%)',
    },
    56: {
      label: 'Freezing Drizzle',
      icon: '🌧️',
      description: 'Light freezing drizzle',
      gradient: 'linear-gradient(160deg, #1a2a38 0%, #2a4558 50%, #1f3545 100%)',
    },
    57: {
      label: 'Freezing Drizzle',
      icon: '🌧️',
      description: 'Dense freezing drizzle',
      gradient: 'linear-gradient(160deg, #162430 0%, #253d4f 50%, #1a3040 100%)',
    },
    61: {
      label: 'Light Rain',
      icon: '🌧️',
      description: 'Slight rain',
      gradient: 'linear-gradient(160deg, #1c3348 0%, #2d5470 50%, #234058 100%)',
    },
    63: {
      label: 'Rain',
      icon: '🌧️',
      description: 'Moderate rain',
      gradient: 'linear-gradient(160deg, #152a3c 0%, #264860 50%, #1c3850 100%)',
    },
    65: {
      label: 'Heavy Rain',
      icon: '🌧️',
      description: 'Heavy rain',
      gradient: 'linear-gradient(160deg, #0f2030 0%, #1e3a52 50%, #152a40 100%)',
    },
    66: {
      label: 'Freezing Rain',
      icon: '🧊',
      description: 'Light freezing rain',
      gradient: 'linear-gradient(160deg, #142838 0%, #234858 50%, #1a3548 100%)',
    },
    67: {
      label: 'Freezing Rain',
      icon: '🧊',
      description: 'Heavy freezing rain',
      gradient: 'linear-gradient(160deg, #102030 0%, #1c3c4c 50%, #142838 100%)',
    },
    71: {
      label: 'Light Snow',
      icon: '🌨️',
      description: 'Slight snow fall',
      gradient: 'linear-gradient(160deg, #2a3a50 0%, #4a6080 50%, #3a5070 100%)',
    },
    73: {
      label: 'Snow',
      icon: '❄️',
      description: 'Moderate snow fall',
      gradient: 'linear-gradient(160deg, #243448 0%, #3d5470 50%, #304860 100%)',
    },
    75: {
      label: 'Heavy Snow',
      icon: '❄️',
      description: 'Heavy snow fall',
      gradient: 'linear-gradient(160deg, #1c2a3c 0%, #324860 50%, #243850 100%)',
    },
    77: {
      label: 'Snow Grains',
      icon: '🌨️',
      description: 'Snow grains',
      gradient: 'linear-gradient(160deg, #222e40 0%, #3a4e68 50%, #2c3c54 100%)',
    },
    80: {
      label: 'Light Showers',
      icon: '🌦️',
      description: 'Slight rain showers',
      gradient: 'linear-gradient(160deg, #1e3a50 0%, #356080 50%, #284c68 100%)',
    },
    81: {
      label: 'Showers',
      icon: '🌧️',
      description: 'Moderate rain showers',
      gradient: 'linear-gradient(160deg, #183040 0%, #2c5068 50%, #204050 100%)',
    },
    82: {
      label: 'Heavy Showers',
      icon: '⛈️',
      description: 'Violent rain showers',
      gradient: 'linear-gradient(160deg, #101c2c 0%, #203848 50%, #162838 100%)',
    },
    85: {
      label: 'Snow Showers',
      icon: '🌨️',
      description: 'Slight snow showers',
      gradient: 'linear-gradient(160deg, #243040 0%, #3c5070 50%, #2c3c58 100%)',
    },
    86: {
      label: 'Heavy Snow Showers',
      icon: '❄️',
      description: 'Heavy snow showers',
      gradient: 'linear-gradient(160deg, #1a2535 0%, #304060 50%, #222e48 100%)',
    },
    95: {
      label: 'Thunderstorm',
      icon: '⛈️',
      description: 'Thunderstorm',
      gradient: 'linear-gradient(160deg, #0e1420 0%, #1e2a40 40%, #2a1a30 100%)',
    },
    96: {
      label: 'Thunderstorm',
      icon: '⛈️',
      description: 'Thunderstorm with slight hail',
      gradient: 'linear-gradient(160deg, #0c1018 0%, #1a2438 40%, #281828 100%)',
    },
    99: {
      label: 'Severe Storm',
      icon: '⛈️',
      description: 'Thunderstorm with heavy hail',
      gradient: 'linear-gradient(160deg, #080c14 0%, #141c30 40%, #200c1c 100%)',
    },
  }

  return (
    map[code] ?? {
      label: 'Unknown',
      icon: '🌡️',
      description: 'Unknown conditions',
      gradient: 'linear-gradient(160deg, #1a2030 0%, #2a3548 50%, #1e2838 100%)',
    }
  )
}

export function aqiLabel(aqi: number): { label: string; color: string; advice: string } {
  if (aqi <= 50) return { label: 'Good', color: '#22c55e', advice: 'Air quality is satisfactory.' }
  if (aqi <= 100)
    return { label: 'Moderate', color: '#eab308', advice: 'Acceptable for most people.' }
  if (aqi <= 150)
    return {
      label: 'Unhealthy for Sensitive',
      color: '#f97316',
      advice: 'Sensitive groups should limit outdoor exertion.',
    }
  if (aqi <= 200)
    return { label: 'Unhealthy', color: '#ef4444', advice: 'Everyone may feel effects.' }
  if (aqi <= 300)
    return {
      label: 'Very Unhealthy',
      color: '#a855f7',
      advice: 'Health warnings of emergency conditions.',
    }
  return { label: 'Hazardous', color: '#7f1d1d', advice: 'Everyone should avoid outdoor activity.' }
}

export function uvLabel(uv: number): { label: string; color: string } {
  if (uv < 3) return { label: 'Low', color: '#22c55e' }
  if (uv < 6) return { label: 'Moderate', color: '#eab308' }
  if (uv < 8) return { label: 'High', color: '#f97316' }
  if (uv < 11) return { label: 'Very High', color: '#ef4444' }
  return { label: 'Extreme', color: '#a855f7' }
}

export function windDirection(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  return dirs[Math.round(deg / 22.5) % 16]
}
