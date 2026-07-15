const KEY = 'atmos-dismissed-alerts-v1'

export function loadDismissedAlertIds(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as string[]
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

export function saveDismissedAlertIds(ids: Set<string>) {
  try {
    // Cap so storage doesn't grow forever
    localStorage.setItem(KEY, JSON.stringify([...ids].slice(-80))
    )
  } catch {
    /* ignore */
  }
}

export function dismissAlertId(id: string, current: Set<string>): Set<string> {
  const next = new Set(current)
  next.add(id)
  saveDismissedAlertIds(next)
  return next
}

export function dismissAllAlertIds(
  ids: string[],
  current: Set<string>,
): Set<string> {
  const next = new Set(current)
  for (const id of ids) next.add(id)
  saveDismissedAlertIds(next)
  return next
}

export function clearDismissedAlertIds(): Set<string> {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
  return new Set()
}
