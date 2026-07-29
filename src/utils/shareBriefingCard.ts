/**
 * Draw a Storm Chasers briefing card to canvas and trigger download / share.
 */
import type { StormChaserBrief } from './stormChaser'

function levelColor(level: string): string {
  switch (level) {
    case 'high':
      return '#ef4444'
    case 'moderate':
      return '#f97316'
    case 'enhanced':
      return '#fb923c'
    case 'slight':
      return '#fbbf24'
    default:
      return '#64748b'
  }
}

export async function renderBriefingCard(opts: {
  placeName: string
  brief: StormChaserBrief
  tempLabel: string
  url?: string
  /** Optional NWS/ECCC alert titles for the chase pack */
  alertLines?: string[]
}): Promise<Blob | null> {
  const { placeName, brief, tempLabel, url, alertLines } = opts
  const w = 900
  const h = 560
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const grd = ctx.createLinearGradient(0, 0, w, h)
  grd.addColorStop(0, '#070b14')
  grd.addColorStop(0.45, '#1a1020')
  grd.addColorStop(1, '#0c1424')
  ctx.fillStyle = grd
  ctx.fillRect(0, 0, w, h)

  // Accent bar
  ctx.fillStyle = levelColor(brief.overall.level)
  ctx.fillRect(0, 0, w, 6)

  ctx.fillStyle = '#fecaca'
  ctx.font = '700 20px system-ui,sans-serif'
  ctx.fillText('Solara · Chase pack', 40, 48)

  ctx.fillStyle = '#f8fafc'
  ctx.font = '700 34px system-ui,sans-serif'
  ctx.fillText(placeName.slice(0, 42), 40, 96)

  ctx.fillStyle = 'rgba(226,232,240,0.75)'
  ctx.font = '500 18px system-ui,sans-serif'
  const summary = `${brief.overall.emoji} ${brief.overall.summary}`
  wrapText(ctx, summary, 40, 132, w - 240, 26)

  ctx.font = '800 58px system-ui,sans-serif'
  ctx.fillStyle = '#fff'
  ctx.fillText(tempLabel, w - 190, 100)

  // Hazard chips
  const hazards = [brief.tornado, brief.hail, brief.wind, brief.flood]
  let x = 40
  const y = 220
  for (const hz of hazards) {
    const label = `${hz.emoji} ${hz.label}: ${hz.level}`
    ctx.font = '600 15px system-ui,sans-serif'
    const tw = ctx.measureText(label).width + 28
    ctx.fillStyle = 'rgba(15,23,42,0.75)'
    roundRect(ctx, x, y, tw, 34, 10)
    ctx.fill()
    ctx.strokeStyle = levelColor(hz.level)
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = '#f1f5f9'
    ctx.fillText(label, x + 14, y + 22)
    x += tw + 10
  }

  ctx.fillStyle = 'rgba(226,232,240,0.85)'
  ctx.font = '500 17px system-ui,sans-serif'
  const meta = [
    brief.atmosphere.capePeak != null
      ? `CAPE peak ${Math.round(brief.atmosphere.capePeak)} J/kg`
      : brief.atmosphere.cape != null
        ? `CAPE ${Math.round(brief.atmosphere.cape)} J/kg`
        : null,
    brief.peaks.thunderLikely
      ? `Thunder${brief.peaks.nextStormLabel ? ` ~${brief.peaks.nextStormLabel}` : ''}`
      : 'Limited thunder',
    `PoP max ${Math.round(brief.peaks.pop)}%`,
    `Gusts ${Math.round(brief.peaks.gustKmh)} km/h`,
  ]
    .filter(Boolean)
    .join(' · ')
  ctx.fillText(meta, 40, 290)

  if (alertLines?.length) {
    ctx.fillStyle = '#fca5a5'
    ctx.font = '600 15px system-ui,sans-serif'
    ctx.fillText('Active alerts', 40, 330)
    ctx.fillStyle = 'rgba(254,202,202,0.9)'
    ctx.font = '500 15px system-ui,sans-serif'
    let ay = 354
    for (const line of alertLines.slice(0, 3)) {
      ctx.fillText(`• ${line.slice(0, 70)}`, 40, ay)
      ay += 22
    }
  }

  ctx.fillStyle = 'rgba(148,163,184,0.95)'
  ctx.font = '500 14px system-ui,sans-serif'
  ctx.fillText(
    'Decision support only — use NWS / ECCC / SPC official products. Never drive into a core.',
    40,
    480,
  )

  if (url) {
    ctx.fillStyle = '#38bdf8'
    ctx.font = '600 16px system-ui,sans-serif'
    ctx.fillText(url.replace(/^https?:\/\//, '').slice(0, 60), 40, 520)
  } else {
    ctx.fillStyle = '#64748b'
    ctx.font = '600 16px system-ui,sans-serif'
    ctx.fillText('solaraweather.com/chase', 40, 520)
  }

  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/png')
  })
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(' ')
  let line = ''
  let yy = y
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy)
      line = word
      yy += lineHeight
    } else line = test
  }
  if (line) ctx.fillText(line, x, yy)
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export async function downloadBriefingCard(opts: {
  placeName: string
  brief: StormChaserBrief
  tempLabel: string
  url?: string
}): Promise<boolean> {
  const blob = await renderBriefingCard(opts)
  if (!blob) return false
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `solara-chase-${opts.placeName.replace(/\W+/g, '-').slice(0, 32)}.png`
  a.click()
  URL.revokeObjectURL(a.href)
  return true
}

export async function shareBriefingCard(opts: {
  placeName: string
  brief: StormChaserBrief
  tempLabel: string
  url?: string
  text?: string
  alertLines?: string[]
}): Promise<'shared' | 'downloaded' | 'copied' | 'failed'> {
  const blob = await renderBriefingCard(opts)
  const packText =
    opts.text ||
    [
      `Solara Chase Pack — ${opts.placeName}`,
      opts.brief.shareText,
      opts.alertLines?.length ? `Alerts: ${opts.alertLines.slice(0, 3).join(' · ')}` : null,
      opts.url,
    ]
      .filter(Boolean)
      .join('\n')

  if (blob) {
    const file = new File([blob], 'solara-chase-pack.png', { type: 'image/png' })
    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `Chase pack — ${opts.placeName}`,
          text: packText,
          files: [file],
          url: opts.url,
        })
        return 'shared'
      }
    } catch {
      /* fall through */
    }
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Chase pack — ${opts.placeName}`,
          text: packText,
          url: opts.url,
        })
        return 'shared'
      }
    } catch {
      /* fall through */
    }
    const ok = await downloadBriefingCard(opts)
    if (ok) return 'downloaded'
  }

  try {
    await navigator.clipboard.writeText(packText)
    return 'copied'
  } catch {
    return 'failed'
  }
}
