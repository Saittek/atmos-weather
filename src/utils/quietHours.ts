/**
 * Quiet hours for push / in-app alert notifications.
 * Prefer an IANA timezone (home / forecast TZ). Falls back to device local.
 */

export interface QuietHoursPrefs {
  quietHoursEnabled?: boolean
  /** "HH:MM" 24h in the evaluation timezone */
  quietStart?: string
  /** "HH:MM" 24h in the evaluation timezone */
  quietEnd?: string
}

function parseHm(hm: string | undefined, fallback: number): number {
  if (!hm || !/^\d{1,2}:\d{2}$/.test(hm)) return fallback
  const [h, m] = hm.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return fallback
  return ((h % 24) * 60 + (m % 60) + 24 * 60) % (24 * 60)
}

/** Minutes since local midnight in `timeZone` (or device local if missing). */
export function minutesOfDayInZone(date: Date = new Date(), timeZone?: string | null): number {
  if (!timeZone) {
    return date.getHours() * 60 + date.getMinutes()
  }
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
      timeZone,
    }).formatToParts(date)
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
    // Some engines emit hour 24 at midnight
    const hour = h === 24 ? 0 : h
    return ((hour % 24) * 60 + (m % 60) + 24 * 60) % (24 * 60)
  } catch {
    return date.getHours() * 60 + date.getMinutes()
  }
}

/**
 * Returns true if `date` falls inside the quiet window in `timeZone`.
 * Supports windows that cross midnight (e.g. 22:00 → 07:00).
 */
export function isInQuietHours(
  prefs: QuietHoursPrefs,
  date: Date = new Date(),
  timeZone?: string | null,
): boolean {
  if (!prefs.quietHoursEnabled) return false
  const start = parseHm(prefs.quietStart, 22 * 60)
  const end = parseHm(prefs.quietEnd, 7 * 60)
  const now = minutesOfDayInZone(date, timeZone)

  if (start === end) return false // zero-length window
  if (start < end) {
    // Same day, e.g. 09:00–17:00
    return now >= start && now < end
  }
  // Overnight, e.g. 22:00–07:00
  return now >= start || now < end
}

/**
 * Extreme alerts may still notify during quiet hours.
 * Severe warnings near home can pass when allowSevere=true (home escalation).
 */
export function shouldSuppressAlertNotify(
  prefs: QuietHoursPrefs,
  severity: string,
  date: Date = new Date(),
  timeZone?: string | null,
  opts?: { allowSevereThrough?: boolean },
): boolean {
  if (!isInQuietHours(prefs, date, timeZone)) return false
  const s = String(severity || '').toLowerCase()
  if (s === 'extreme') return false
  if (opts?.allowSevereThrough && (s === 'severe' || s === 'warning')) return false
  return true
}
