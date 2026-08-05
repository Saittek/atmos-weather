import { useCallback, useState } from 'react'
import type { LocationResult, WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import { formatTemp } from '../utils/format'
import { isDaytimeNow } from '../utils/daylight'
import { getWeatherInfo } from '../utils/weatherCodes'
import { willIGetWet } from '../utils/wetSummary'
import { shareUrl } from '../api/weather'
import { todayDailyIndex } from '../utils/weatherStory'

interface Props {
  weather: WeatherData
  location: LocationResult
  units: Units
}

export function ShareWeatherCard({ weather, location, units }: Props) {
  const [msg, setMsg] = useState<string | null>(null)
  const c = weather.current
  const info = getWeatherInfo(c.weather_code, isDaytimeNow(weather))
  const wet = willIGetWet(weather)
  const ti = todayDailyIndex(weather)
  const hi = weather.daily.temperature_2m_max[ti]
  const lo = weather.daily.temperature_2m_min[ti]

  const highSafe =
    hi != null && Number.isFinite(hi) ? Math.max(hi, c.temperature_2m) : c.temperature_2m
  const lowSafe =
    lo != null && Number.isFinite(lo) ? Math.min(lo, c.temperature_2m) : c.temperature_2m
  const text = `${location.name}: ${formatTemp(c.temperature_2m, units)} ${info.label}. ${wet.title}. H ${formatTemp(highSafe, units)} / L ${formatTemp(lowSafe, units)} — via Solara Weather`
  const url = shareUrl(location)

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`)
      setMsg('Copied share text + link')
    } catch {
      setMsg(url)
    }
    window.setTimeout(() => setMsg(null), 2500)
  }, [text, url])

  const nativeShare = useCallback(async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `Solara · ${location.name}`,
          text,
          url,
        })
        setMsg('Shared')
        window.setTimeout(() => setMsg(null), 2000)
        return
      } catch (e) {
        // User cancel — don't fall through to copy spam
        if (e instanceof DOMException && e.name === 'AbortError') return
      }
    }
    await copy()
  }, [location.name, text, url, copy])

  const downloadCard = useCallback(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 720
    canvas.height = 420
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const grd = ctx.createLinearGradient(0, 0, 720, 420)
    grd.addColorStop(0, '#0b1220')
    grd.addColorStop(0.5, '#132238')
    grd.addColorStop(1, '#0f172a')
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, 720, 420)

    ctx.fillStyle = 'rgba(56,189,248,0.15)'
    ctx.beginPath()
    ctx.arc(600, 80, 120, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#f1f5f9'
    ctx.font = '700 28px system-ui,sans-serif'
    ctx.fillText('Solara', 40, 56)
    ctx.font = '600 22px system-ui,sans-serif'
    ctx.fillStyle = '#94a3b8'
    ctx.fillText(location.name.slice(0, 36), 40, 96)

    ctx.fillStyle = '#f8fafc'
    ctx.font = '800 96px system-ui,sans-serif'
    ctx.fillText(formatTemp(c.temperature_2m, units), 40, 220)

    ctx.font = '600 28px system-ui,sans-serif'
    ctx.fillStyle = '#e2e8f0'
    ctx.fillText(info.label, 40, 270)

    ctx.font = '500 22px system-ui,sans-serif'
    ctx.fillStyle = '#7dd3fc'
    ctx.fillText(wet.title.slice(0, 48), 40, 320)

    ctx.fillStyle = '#94a3b8'
    ctx.font = '500 18px system-ui,sans-serif'
    ctx.fillText(
      `H ${formatTemp(highSafe, units)}  ·  L ${formatTemp(lowSafe, units)}  ·  Feels ${formatTemp(c.apparent_temperature, units)}`,
      40,
      360,
    )

    ctx.fillStyle = '#64748b'
    ctx.font = '500 14px system-ui,sans-serif'
    ctx.fillText('will you get wet?', 40, 395)

    canvas.toBlob((blob) => {
      if (!blob) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `solara-${location.name.replace(/\s+/g, '-').toLowerCase()}.png`
      a.click()
      URL.revokeObjectURL(a.href)
      setMsg('Card image downloaded')
      window.setTimeout(() => setMsg(null), 2500)
    }, 'image/png')
  }, [c, hi, lo, info.label, location.name, units, wet.title])

  return (
    <section className="panel share-card-panel">
      <div className="panel-header">
        <h2>📤 Share this weather</h2>
      </div>
      <div className="share-card-preview" aria-hidden>
        <div className="share-card-inner">
          <span className="share-brand">Solara</span>
          <strong className="share-place">{location.name}</strong>
          <span className="share-temp">{formatTemp(c.temperature_2m, units)}</span>
          <span className="share-cond">{info.label}</span>
          <span className="share-wet">{wet.title}</span>
          <span className="share-hl">
            H {formatTemp(hi, units)} · L {formatTemp(lo, units)}
          </span>
        </div>
      </div>
      <div className="share-card-actions">
        <button type="button" className="primary-btn" onClick={() => void nativeShare()}>
          Share
        </button>
        <button type="button" className="chip-btn" onClick={() => void copy()}>
          Copy link
        </button>
        <button type="button" className="chip-btn" onClick={downloadCard}>
          Save image
        </button>
      </div>
      {msg && (
        <p className="share-card-msg" role="status">
          {msg}
        </p>
      )}
    </section>
  )
}
