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
}): Promise<Blob | null> {
  const { placeName, brief, tempLabel, url } = opts
  const w = 900
  const h = 520
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
  ctx.font = '700 22px system-ui,sans-serif'
  ctx.fillText('Solara · Storm Chasers', 40, 52)

  ctx.fillStyle = '#f8fafc'
  ctx.font = '700 36px system-ui,sans-serif'
  ctx.fillText(placeName.slice(0, 42), 40, 100)

  ctx.fillStyle = 'rgba(226,232,240,0.75)'
  ctx.font = '500 20px system-ui,sans-serif'
  const summary = `${brief.overall.emoji} ${brief.overall.summary}`
  wrapText(ctx, summary, 40, 140, w - 80, 28)

  ctx.font = '800 64px system-ui,sans-serif'
  ctx.fillStyle = '#fff'
  ctx.fillText(tempLabel, w - 200, 110)

  // Hazard chips
  const hazards = [brief.tornado, brief.hail, brief.wind, brief.flood]
  let x = 40
  const y = 240
  for (const hz of hazards) {
    const label = `${hz.emoji} ${hz.label}: ${hz.level}`
    ctx.font = '600 16px system-ui,sans-serif'
    const tw = ctx.measureText(label).width + 28
    ctx.fillStyle = 'rgba(15,23,42,0.75)'
    roundRect(ctx, x, y, tw, 36, 10)
    ctx.fill()
    ctx.strokeStyle = levelColor(hz.level)
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = '#f1f5f9'
    ctx.fillText(label, x + 14, y + 24)
    x += tw + 12
  }

  ctx.fillStyle = 'rgba(226,232,240,0.8)'
  ctx.font = '500 18px system-ui,sans-serif'
  const meta = [
    brief.atmosphere.capePeak != null
      ? `CAPE peak ${Math.round(brief.atmosphere.capePeak)} J/kg`
      : null,
    brief.peaks.thunderLikely
      ? `Thunder${brief.peaks.nextStormLabel ? ` ~${brief.peaks.nextStormLabel}` : ''}`
      : 'Limited thunder',
    `PoP max ${Math.round(brief.peaks.pop)}%`,
  ]
    .filter(Boolean)
    .join(' · ')
  ctx.fillText(meta, 40, 320)

  ctx.fillStyle = 'rgba(148,163,184,0.95)'
  ctx.font = '500 15px system-ui,sans-serif'
  ctx.fillText(
    'Decision support only — use NWS / ECCC / SPC official products.',
    40,
    380,
  )

  if (url) {
    ctx.fillStyle = '#38bdf8'
    ctx.font = '600 16px system-ui,sans-serif'
    ctx.fillText(url.replace(/^https?:\/\//, '').slice(0, 60), 40, 470)
  } else {
    ctx.fillStyle = '#64748b'
    ctx.font = '600 16px system-ui,sans-serif'
    ctx.fillText('solaraweather.com/chase', 40, 470)
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
}): Promise<'shared' | 'downloaded' | 'failed'> {
  const blob = await renderBriefingCard(opts)
  if (!blob) return 'failed'
  const file = new File([blob], 'solara-chase-brief.png', { type: 'image/png' })
  try {
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        title: `Storm Chasers — ${opts.placeName}`,
        text: opts.text || opts.brief.shareText,
        files: [file],
      })
      return 'shared'
    }
  } catch {
    /* fall through */
  }
  const ok = await downloadBriefingCard(opts)
  return ok ? 'downloaded' : 'failed'
}
