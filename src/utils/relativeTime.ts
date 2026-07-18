/** Short relative time for “Updated …” labels */
export function formatUpdatedAgo(ts: number, now = Date.now()): string {
  const sec = Math.max(0, Math.round((now - ts) / 1000))
  if (sec < 40) return 'just now'
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  return `${Math.floor(sec / 86400)}d ago`
}
