/**
 * Quiet hours for push / in-app alert notifications.
 * Window is local device time unless a timezone string is supplied.
 */

export interface QuietHoursPrefs {
  quietHoursEnabled?: boolean
  /** "HH:MM" 24h local */
  quietStart?: string
  /** "HH:MM" 24h local */
  quietEnd?: string
}

function parseHm(hm: string | undefined, fallback: number): number {
  if (!hm || !/^\d{1,2}:\d{2}$/.test(hm)) return fallback
  const [h, m] = hm.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return fallback
  return ((h % 24) * 60 + (m % 60) + 24 * 60) % (24 * 60)
}

/**
 * Returns true if `date` falls inside the quiet window.
 * Supports windows that cross midnight (e.g. 22:00 → 07:00).
 */
export function isInQuietHours(
  prefs: QuietHoursPrefs,
  date: Date = new Date(),
): boolean {
  if (!prefs.quietHoursEnabled) return false
  const start = parseHm(prefs.quietStart, 22 * 60)
  const end = parseHm(prefs.quietEnd, 7 * 60)
  const now = date.getHours() * 60 + date.getMinutes()

  if (start === end) return false // zero-length window
  if (start < end) {
    // Same day, e.g. 09:00–17:00
    return now >= start && now < end
  }
  // Overnight, e.g. 22:00–07:00
  return now >= start || now < end
}

/** Extreme alerts may still notify during quiet hours. */
export function shouldSuppressAlertNotify(
  prefs: QuietHoursPrefs,
  severity: string,
  date: Date = new Date(),
): boolean {
  if (!isInQuietHours(prefs, date)) return false
  const s = String(severity || '').toLowerCase()
  if (s === 'extreme') return false
  return true
}
