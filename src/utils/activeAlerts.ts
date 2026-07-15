import type { WeatherAlert } from '../api/types'

function parseAlertTime(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}

/**
 * Keep only alerts that are currently in effect.
 * - Drop if ends/expires is in the past
 * - Drop if onset is far in the future (> 7 days) without current validity
 * - Drop cancelled / ended / expired wording in event/headline when no times
 */
export function isAlertActive(alert: WeatherAlert, now = Date.now()): boolean {
  const ends = parseAlertTime(alert.ends)
  if (ends != null && ends <= now) return false

  const onset = parseAlertTime(alert.onset)
  // Future-only products more than a week out aren't "active" for the top bar
  if (onset != null && onset > now + 7 * 24 * 3600_000) return false

  const blob = `${alert.event} ${alert.headline} ${alert.description}`.toLowerCase()
  if (
    /\b(cancelled|canceled|expired|has ended|no longer in effect|ended at)\b/.test(
      blob,
    ) &&
    (ends == null || ends <= now + 3600_000)
  ) {
    // Only drop on wording if also expired or no end time left
    if (ends != null && ends <= now) return false
    if (ends == null && /\b(cancelled|canceled|expired|no longer in effect)\b/.test(blob))
      return false
  }

  return true
}

export function filterActiveAlerts(
  alerts: WeatherAlert[],
  now = Date.now(),
): WeatherAlert[] {
  return alerts.filter((a) => isAlertActive(a, now))
}
