/**
 * Unit checks for Google WeatherNext 3 → Solara WeatherData mapping.
 * No API key required.
 *
 * Usage: node scripts/test-google-weather.mjs
 */
import {
  googleConditionToWmo,
  googleWeatherApiKey,
  mapGoogleToWeatherData,
  qpfMm,
  speedKmh,
  tempC,
  visibilityM,
} from '../worker/google-weather.js'

const checks = []
function ok(name, detail = '') {
  checks.push({ name, pass: true, detail })
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`)
}
function fail(name, detail = '') {
  checks.push({ name, pass: false, detail })
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
}

function assert(name, cond, detail = '') {
  if (cond) ok(name, detail)
  else fail(name, detail)
}

function sampleCurrent() {
  return {
    currentTime: '2026-09-06T18:00:00Z',
    timeZone: { id: 'America/Regina' },
    isDaytime: true,
    weatherCondition: { type: 'PARTLY_CLOUDY' },
    temperature: { unit: 'CELSIUS', degrees: 18.2 },
    feelsLikeTemperature: { unit: 'CELSIUS', degrees: 16.4 },
    dewPoint: { unit: 'CELSIUS', degrees: 7 },
    relativeHumidity: 52,
    cloudCover: 40,
    uvIndex: 4,
    airPressure: { meanSeaLevelMillibars: 1012.4 },
    wind: {
      direction: { degrees: 270 },
      speed: { unit: 'KILOMETERS_PER_HOUR', value: 18 },
      gust: { unit: 'KILOMETERS_PER_HOUR', value: 32 },
    },
    visibility: { unit: 'KILOMETERS', distance: 16 },
    precipitation: {
      probability: { type: 'RAIN', percent: 10 },
      qpf: { unit: 'MILLIMETERS', quantity: 0.2 },
      snowQpf: { unit: 'MILLIMETERS', quantity: 0 },
    },
  }
}

function sampleHourly() {
  return {
    timeZone: { id: 'America/Regina' },
    forecastHours: [
      {
        interval: { startTime: '2026-09-06T18:00:00Z' },
        displayDateTime: { year: 2026, month: 9, day: 6, hours: 12, minutes: 0 },
        weatherCondition: { type: 'LIGHT_RAIN' },
        temperature: { unit: 'CELSIUS', degrees: 17 },
        feelsLikeTemperature: { unit: 'CELSIUS', degrees: 15 },
        dewPoint: { unit: 'CELSIUS', degrees: 8 },
        relativeHumidity: 60,
        isDaytime: true,
        cloudCover: 80,
        uvIndex: 2,
        airPressure: { meanSeaLevelMillibars: 1011 },
        wind: {
          direction: { degrees: 260 },
          speed: { unit: 'KILOMETERS_PER_HOUR', value: 20 },
          gust: { unit: 'KILOMETERS_PER_HOUR', value: 34 },
        },
        visibility: { unit: 'KILOMETERS', distance: 8 },
        precipitation: {
          probability: { type: 'RAIN', percent: 70 },
          qpf: { unit: 'MILLIMETERS', quantity: 1.4 },
          snowQpf: { unit: 'MILLIMETERS', quantity: 0 },
        },
      },
      {
        interval: { startTime: '2026-09-06T19:00:00Z' },
        displayDateTime: { year: 2026, month: 9, day: 6, hours: 13, minutes: 0 },
        weatherCondition: { type: 'CLEAR' },
        temperature: { unit: 'CELSIUS', degrees: 19 },
        feelsLikeTemperature: { unit: 'CELSIUS', degrees: 18 },
        dewPoint: { unit: 'CELSIUS', degrees: 6 },
        relativeHumidity: 45,
        isDaytime: true,
        cloudCover: 10,
        uvIndex: 5,
        airPressure: { meanSeaLevelMillibars: 1012 },
        wind: {
          direction: { degrees: 250 },
          speed: { unit: 'KILOMETERS_PER_HOUR', value: 12 },
          gust: { unit: 'KILOMETERS_PER_HOUR', value: 18 },
        },
        visibility: { unit: 'KILOMETERS', distance: 16 },
        precipitation: {
          probability: { type: 'NONE', percent: 5 },
          qpf: { unit: 'MILLIMETERS', quantity: 0 },
          snowQpf: { unit: 'MILLIMETERS', quantity: 0 },
        },
      },
    ],
  }
}

function sampleDaily() {
  return {
    timeZone: { id: 'America/Regina' },
    forecastDays: [
      {
        displayDate: { year: 2026, month: 9, day: 6 },
        maxTemperature: { unit: 'CELSIUS', degrees: 22 },
        minTemperature: { unit: 'CELSIUS', degrees: 8 },
        feelsLikeMaxTemperature: { unit: 'CELSIUS', degrees: 21 },
        feelsLikeMinTemperature: { unit: 'CELSIUS', degrees: 6 },
        sunEvents: {
          sunriseTime: '2026-09-06T12:30:00Z',
          sunsetTime: '2026-09-07T00:15:00Z',
        },
        daytimeForecast: {
          weatherCondition: { type: 'SCATTERED_SHOWERS' },
          precipitation: {
            probability: { type: 'RAIN', percent: 40 },
            qpf: { unit: 'MILLIMETERS', quantity: 2.5 },
            snowQpf: { unit: 'MILLIMETERS', quantity: 0 },
          },
          wind: {
            direction: { degrees: 270 },
            speed: { unit: 'KILOMETERS_PER_HOUR', value: 24 },
            gust: { unit: 'KILOMETERS_PER_HOUR', value: 40 },
          },
          uvIndex: 6,
          cloudCover: 55,
        },
        nighttimeForecast: {
          weatherCondition: { type: 'MOSTLY_CLEAR' },
          precipitation: {
            probability: { type: 'RAIN', percent: 15 },
            qpf: { unit: 'MILLIMETERS', quantity: 0.1 },
            snowQpf: { unit: 'MILLIMETERS', quantity: 0 },
          },
          wind: {
            direction: { degrees: 280 },
            speed: { unit: 'KILOMETERS_PER_HOUR', value: 10 },
            gust: { unit: 'KILOMETERS_PER_HOUR', value: 16 },
          },
          uvIndex: 0,
          cloudCover: 20,
        },
      },
    ],
  }
}

console.log('\nSolara Google Weather mapper\n')

assert('CLEAR → WMO 0', googleConditionToWmo('CLEAR') === 0)
assert('HEAVY_RAIN → WMO 65', googleConditionToWmo('HEAVY_RAIN') === 65)
assert('THUNDERSTORM → WMO 95', googleConditionToWmo('THUNDERSTORM') === 95)
assert('HEAVY_THUNDERSTORM → WMO 99', googleConditionToWmo('HEAVY_THUNDERSTORM') === 99)
assert('LIGHT_SNOW → WMO 71', googleConditionToWmo('LIGHT_SNOW') === 71)
assert('unknown type → 0', googleConditionToWmo('TOTALLY_MADE_UP') === 0)

assert('tempC metric', Math.abs(tempC({ unit: 'CELSIUS', degrees: 10 }) - 10) < 1e-9)
assert('tempC fahrenheit', Math.abs(tempC({ unit: 'FAHRENHEIT', degrees: 50 }) - 10) < 1e-9)
assert('speed mph → km/h', Math.abs(speedKmh({ unit: 'MILES_PER_HOUR', value: 10 }) - 10 / 0.621371) < 1e-6)
assert('qpf inches → mm', Math.abs(qpfMm({ unit: 'INCHES', quantity: 1 }) - 25.4) < 1e-9)
assert('visibility km → m', visibilityM({ unit: 'KILOMETERS', distance: 2 }) === 2000)

assert('key prefers GOOGLE_WEATHER_API_KEY', googleWeatherApiKey({
  GOOGLE_WEATHER_API_KEY: 'wx',
  GOOGLE_MAPS_API_KEY: 'maps',
}) === 'wx')
assert('key falls back to GOOGLE_MAPS_API_KEY', googleWeatherApiKey({
  GOOGLE_MAPS_API_KEY: ' maps ',
}) === 'maps')
assert('empty key is unconfigured', googleWeatherApiKey({}) === '')

try {
  const w = mapGoogleToWeatherData(
    sampleCurrent(),
    sampleHourly(),
    sampleDaily(),
    52.1579,
    -106.6702,
  )
  assert('mapped current temp', w.current.temperature_2m === 18.2)
  assert('mapped current WMO', w.current.weather_code === 2)
  assert('mapped hourly length', w.hourly.time.length === 2)
  assert('mapped hourly local wall clock', w.hourly.time[0] === '2026-09-06T12:00')
  assert('mapped hourly pop', w.hourly.precipitation_probability[0] === 70)
  assert('mapped hourly precip mm', w.hourly.precipitation[0] === 1.4)
  assert('mapped daily date', w.daily.time[0] === '2026-09-06')
  assert('mapped daily high/low', w.daily.temperature_2m_max[0] === 22 && w.daily.temperature_2m_min[0] === 8)
  assert(
    'mapped daily precip sum',
    Math.abs(w.daily.precipitation_sum[0] - 2.6) < 1e-9,
  )
  assert('timezone kept', w.timezone === 'America/Regina')
  assert('source provider google', w.solara_source?.provider === 'google')
  assert(
    'source strategy WeatherNext',
    w.solara_source?.strategy === 'Google WeatherNext 3',
  )
  assert('current_units celsius', w.current_units.temperature_2m === '°C')
  assert('synthesized 15-min slots', w.minutely_15?.time?.length === 8)
  assert(
    '15-min precip splits the hour',
    Math.abs((w.minutely_15?.precipitation?.[0] ?? 0) - 1.4 / 4) < 1e-9,
  )
} catch (e) {
  fail('mapGoogleToWeatherData', e?.message || String(e))
}

try {
  mapGoogleToWeatherData(null, sampleHourly(), sampleDaily(), 0, 0)
  fail('missing current throws', 'did not throw')
} catch {
  ok('missing current throws')
}

try {
  mapGoogleToWeatherData(sampleCurrent(), { forecastHours: [] }, sampleDaily(), 0, 0)
  fail('empty hourly throws', 'did not throw')
} catch {
  ok('empty hourly throws')
}

const failed = checks.filter((c) => !c.pass)
console.log(`\n${checks.length - failed.length}/${checks.length} passed\n`)
if (failed.length) process.exitCode = 1
