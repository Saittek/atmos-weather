/**
 * Meteor showers + simple night-sky calendar events.
 */

export interface SkyEvent {
  id: string
  name: string
  emoji: string
  startMd: string // MM-DD
  peakMd: string
  endMd: string
  rate: string
  note: string
}

const SHOWERS: SkyEvent[] = [
  {
    id: 'quad',
    name: 'Quadrantids',
    emoji: '☄️',
    startMd: '01-01',
    peakMd: '01-03',
    endMd: '01-05',
    rate: '~60–100/hr peak',
    note: 'Sharp peak; cold northern nights.',
  },
  {
    id: 'lyr',
    name: 'Lyrids',
    emoji: '☄️',
    startMd: '04-16',
    peakMd: '04-22',
    endMd: '04-25',
    rate: '~15–20/hr',
    note: 'Modest spring shower.',
  },
  {
    id: 'eta',
    name: 'Eta Aquariids',
    emoji: '☄️',
    startMd: '04-19',
    peakMd: '05-06',
    endMd: '05-28',
    rate: '~40/hr',
    note: 'Best before dawn; Halley debris.',
  },
  {
    id: 'per',
    name: 'Perseids',
    emoji: '🌟',
    startMd: '07-17',
    peakMd: '08-12',
    endMd: '08-24',
    rate: '~60–100/hr',
    note: 'Best-known summer shower.',
  },
  {
    id: 'ori',
    name: 'Orionids',
    emoji: '☄️',
    startMd: '10-02',
    peakMd: '10-21',
    endMd: '11-07',
    rate: '~20/hr',
    note: 'Halley stream; pre-dawn.',
  },
  {
    id: 'leo',
    name: 'Leonids',
    emoji: '☄️',
    startMd: '11-06',
    peakMd: '11-17',
    endMd: '11-30',
    rate: '~10–15/hr',
    note: 'Fast meteors; occasional storms.',
  },
  {
    id: 'gem',
    name: 'Geminids',
    emoji: '💎',
    startMd: '12-04',
    peakMd: '12-14',
    endMd: '12-17',
    rate: '~100–150/hr',
    note: 'Often the best annual shower.',
  },
  {
    id: 'urs',
    name: 'Ursids',
    emoji: '☄️',
    startMd: '12-17',
    peakMd: '12-22',
    endMd: '12-26',
    rate: '~10/hr',
    note: 'Quiet winter shower near pole.',
  },
]

function md(d: Date): string {
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${m}-${day}`
}

function mdToOrder(s: string): number {
  const [m, d] = s.split('-').map(Number)
  return m * 100 + d
}

export function upcomingSkyEvents(from = new Date(), count = 4): (SkyEvent & {
  status: 'active' | 'upcoming' | 'peak-soon'
  when: string
})[] {
  const now = mdToOrder(md(from))
  const year = from.getUTCFullYear()
  const scored = SHOWERS.map((s) => {
    const start = mdToOrder(s.startMd)
    const peak = mdToOrder(s.peakMd)
    const end = mdToOrder(s.endMd)
    let status: 'active' | 'upcoming' | 'peak-soon' = 'upcoming'
    if (now >= start && now <= end) {
      status = Math.abs(now - peak) <= 1 ? 'peak-soon' : 'active'
    }
    // days until peak (handle year wrap)
    let peakDate = new Date(Date.UTC(year, Number(s.peakMd.slice(0, 2)) - 1, Number(s.peakMd.slice(3))))
    if (peakDate.getTime() < from.getTime() - 2 * 86400000) {
      peakDate = new Date(Date.UTC(year + 1, Number(s.peakMd.slice(0, 2)) - 1, Number(s.peakMd.slice(3))))
    }
    const days = Math.round((peakDate.getTime() - from.getTime()) / 86400000)
    return {
      ...s,
      status,
      when:
        status === 'peak-soon'
          ? 'Peaking now'
          : status === 'active'
            ? 'Active now'
            : days <= 0
              ? 'Peak soon'
              : `Peak in ~${days}d`,
      _days: days,
    }
  })
  return scored
    .sort((a, b) => {
      const rank = (s: string) => (s === 'peak-soon' ? 0 : s === 'active' ? 1 : 2)
      return rank(a.status) - rank(b.status) || a._days - b._days
    })
    .slice(0, count)
    .map(({ _days, ...rest }) => rest)
}
