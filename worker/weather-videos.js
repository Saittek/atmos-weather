/**
 * Free official weather video feed (NOAA / NWS / NHC via YouTube public RSS).
 * US government works are public domain; we embed YouTube rather than rehost.
 */

const CHANNELS = [
  {
    id: 'UC9hQvMjzSxurMirYDgOMezw',
    label: 'National Weather Service',
    tag: 'nws',
  },
  // Same org hub often surfaces hurricane briefings under NWS brand
]

/** Evergreen Weather-Ready Nation / NWS safety videos (official channels) */
const SAFETY = [
  {
    id: 'lqgtk4ozgsg',
    title: 'We Are the National Weather Service',
    channel: 'National Weather Service (NWS)',
    tag: 'safety',
  },
  {
    id: '_5TiTfuvotc',
    title: 'Get Weather Ready: During a Tornado',
    channel: 'National Weather Service (NWS)',
    tag: 'tornado',
  },
  {
    id: 'KvLNySr4Iw4',
    title: 'Get Weather Ready — Before a Tornado',
    channel: 'NOAA',
    tag: 'tornado',
  },
  {
    id: 'Qc4fegt-lAw',
    title: 'Basic Winter Weather Preparedness',
    channel: 'NWS La Crosse',
    tag: 'winter',
  },
]

function decodeXml(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

function parseAtomEntries(xml, channelLabel, tag) {
  const out = []
  const re = /<entry>([\s\S]*?)<\/entry>/gi
  let m
  while ((m = re.exec(xml)) && out.length < 12) {
    const block = m[1]
    const idRaw = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/i)?.[1]
      || block.match(/<id>yt:video:([^<]+)<\/id>/i)?.[1]
    const title = decodeXml(block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')
    const published = block.match(/<published>([^<]+)<\/published>/i)?.[1] || null
    const media = block.match(/<media:thumbnail[^>]+url="([^"]+)"/i)?.[1] || null
    if (!idRaw || !title) continue
    // Skip pure Spanish-only day series noise if English briefing exists (keep bilingual mix)
    out.push({
      id: idRaw.trim(),
      title,
      channel: channelLabel,
      published,
      thumbnail: media,
      tag,
      source: 'youtube',
      embedUrl: `https://www.youtube.com/embed/${idRaw.trim()}?rel=0`,
      watchUrl: `https://www.youtube.com/watch?v=${idRaw.trim()}`,
    })
  }
  return out
}

async function fetchChannelVideos(channel) {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.id}`
  const res = await fetch(url, {
    headers: { Accept: 'application/atom+xml, application/xml, text/xml' },
  })
  if (!res.ok) return []
  const xml = await res.text()
  return parseAtomEntries(xml, channel.label, channel.tag)
}

function seasonalSafety(month) {
  // 0=Jan … 11=Dec
  if (month >= 10 || month <= 2) {
    return SAFETY.filter((v) => v.tag === 'winter' || v.tag === 'safety')
  }
  if (month >= 2 && month <= 6) {
    return SAFETY.filter((v) => v.tag === 'tornado' || v.tag === 'safety')
  }
  // Hurricane season focus
  return SAFETY.filter((v) => v.tag === 'safety' || v.tag === 'tornado')
}

/**
 * @returns {Promise<{ latest: object[], safety: object[], attribution: string }>}
 */
export async function getWeatherVideos() {
  const lists = await Promise.all(
    CHANNELS.map((c) => fetchChannelVideos(c).catch(() => [])),
  )
  const latest = []
  const seen = new Set()
  for (const list of lists) {
    for (const v of list) {
      if (seen.has(v.id)) continue
      seen.add(v.id)
      latest.push(v)
    }
  }
  // Prefer recent English briefings first (still include all)
  latest.sort((a, b) => {
    const ta = a.published ? Date.parse(a.published) : 0
    const tb = b.published ? Date.parse(b.published) : 0
    return tb - ta
  })

  const month = new Date().getUTCMonth()
  const safety = seasonalSafety(month).map((v) => ({
    id: v.id,
    title: v.title,
    channel: v.channel,
    published: null,
    thumbnail: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
    tag: v.tag,
    source: 'youtube',
    embedUrl: `https://www.youtube.com/embed/${v.id}?rel=0`,
    watchUrl: `https://www.youtube.com/watch?v=${v.id}`,
  }))

  // If RSS failed, still return safety list so UI works offline of YouTube RSS
  return {
    latest: latest.slice(0, 10),
    safety,
    attribution:
      'Videos from NOAA / National Weather Service (U.S. government). Public domain content; embedded via YouTube. Not affiliated with YouTube.',
    updatedAt: new Date().toISOString(),
  }
}
