import { buildStargazeBrief } from '../src/utils/stargaze.ts'

const w = {
  latitude: 52.1,
  longitude: -106.6,
  timezone: 'America/Regina',
  timezone_abbreviation: 'CST',
  elevation: 500,
  current: {
    time: '2026-08-04T12:00',
    temperature_2m: 20,
    relative_humidity_2m: 50,
    apparent_temperature: 20,
    is_day: 1,
    precipitation: 0,
    rain: 0,
    showers: 0,
    snowfall: 0,
    weather_code: 0,
    cloud_cover: 10,
    pressure_msl: 1010,
    surface_pressure: 1000,
    wind_speed_10m: 10,
    wind_direction_10m: 270,
    wind_gusts_10m: 15,
  },
  hourly: {
    time: [],
    temperature_2m: [],
    relative_humidity_2m: [],
    dew_point_2m: [],
    apparent_temperature: [],
    precipitation_probability: [],
    precipitation: [],
    rain: [],
    showers: [],
    snowfall: [],
    weather_code: [],
    pressure_msl: [],
    cloud_cover: [],
    visibility: [],
    wind_speed_10m: [],
    wind_direction_10m: [],
    wind_gusts_10m: [],
    uv_index: [],
    is_day: [],
  },
  daily: {
    time: ['2026-08-04', '2026-08-05'],
    weather_code: [0, 0],
    temperature_2m_max: [25, 24],
    temperature_2m_min: [10, 11],
    apparent_temperature_max: [25, 24],
    apparent_temperature_min: [10, 11],
    sunrise: ['2026-08-04T06:00', '2026-08-05T06:01'],
    sunset: ['2026-08-04T21:00', '2026-08-05T20:58'],
    daylight_duration: [50000, 50000],
    sunshine_duration: [40000, 40000],
    uv_index_max: [5, 5],
    precipitation_sum: [0, 0],
    rain_sum: [0, 0],
    showers_sum: [0, 0],
    snowfall_sum: [0, 0],
    precipitation_hours: [0, 0],
    precipitation_probability_max: [0, 0],
    wind_speed_10m_max: [20, 20],
    wind_gusts_10m_max: [30, 30],
    wind_direction_10m_dominant: [270, 270],
  },
  current_units: {},
}

const start = Date.now()
for (let i = 0; i < 48; i++) {
  const d = new Date(start + i * 3600000)
  const iso = d.toISOString().slice(0, 13) + ':00'
  w.hourly.time.push(iso)
  for (const k of Object.keys(w.hourly)) {
    if (k === 'time') continue
    w.hourly[k].push(
      k.includes('cloud')
        ? 20
        : k.includes('humidity')
          ? 55
          : k.includes('wind')
            ? 12
            : k === 'is_day'
              ? i % 24 < 8 || i % 24 > 20
                ? 0
                : 1
              : k.includes('vis')
                ? 20000
                : 0,
    )
  }
}

try {
  const b = buildStargazeBrief(w, { lat: 52.1, lon: -106.6 })
  console.log(
    'OK',
    b.imagingScore,
    b.visualScore,
    b.sqm?.label,
    'hours',
    b.hours.length,
    'nights',
    b.nights.length,
  )
} catch (e) {
  console.error('FAIL', e)
  process.exit(1)
}
