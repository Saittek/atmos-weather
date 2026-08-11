import type { WeatherAlert } from '../api/types'

function parseAlertTime(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}

function cancelWording(blob: string): boolean {
  return /\b(cancelled|canceled|expired|has ended|no longer in effect|ended at|revoqu[ée]|annul[ée]|expir[ée]|termin[ée])\b/i.test(
    blob,
  )
}

/**
 * Keep only alerts that are currently in effect.
 * Cancelled / expired products are always dropped (even if ends is still in the future).
 */
export function isAlertActive(alert: WeatherAlert, now = Date.now()): boolean {
  const ends = parseAlertTime(alert.ends)
  if (ends != null && ends <= now) return false

  const onset = parseAlertTime(alert.onset)
  // Future-only products more than a week out aren't "active" for the top bar
  if (onset != null && onset > now + 7 * 24 * 3600_000) return false

  const blob = `${alert.event} ${alert.headline} ${alert.description} ${alert.instruction ?? ''}`
  // Cancelled wording wins over a future ends time (stale CAP products)
  if (cancelWording(blob)) return false

  return true
}

export function filterActiveAlerts(
  alerts: WeatherAlert[],
  now = Date.now(),
): WeatherAlert[] {
  return alerts.filter((a) => isAlertActive(a, now))
}
