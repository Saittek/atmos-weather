/**
 * Poll severe polygons and surface nearby TOR/SVR/FF threats with
 * optional haptic + sound + local notification (once per alert id).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchAllThreatPolygons,
  findNearbyThreats,
  type NearbyThreat,
  type StormWarning,
} from '../api/severeLayers'
import { showLocalAlert } from '../api/push'
import { isNativeApp, lightHaptic } from '../lib/native'

const NOTIFIED_KEY = 'solara-threat-notified-v1'
const MAX_KM = 80
const POLL_MS = 2 * 60_000

function loadNotified(): Set<string> {
  try {
    const raw = sessionStorage.getItem(NOTIFIED_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

function saveNotified(s: Set<string>) {
  try {
    const arr = [...s].slice(-80)
    sessionStorage.setItem(NOTIFIED_KEY, JSON.stringify(arr))
  } catch {
    /* ignore */
  }
}

function playThreatTone(urgent: boolean) {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.value = urgent ? 880 : 620
    g.gain.value = 0.0001
    o.connect(g)
    g.connect(ctx.destination)
    const t0 = ctx.currentTime
    g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (urgent ? 0.45 : 0.28))
    o.start(t0)
    o.stop(t0 + 0.5)
    window.setTimeout(() => void ctx.close(), 600)
  } catch {
    /* autoplay blocked until user gesture — ok */
  }
}

export async function heavyHaptic(): Promise<void> {
  if (!isNativeApp()) return
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
    await Haptics.impact({ style: ImpactStyle.Heavy })
  } catch {
    await lightHaptic()
  }
}

export interface ThreatProximityState {
  loading: boolean
  warnings: StormWarning[]
  threats: NearbyThreat[]
  nearest: NearbyThreat | null
  refresh: () => void
  /** Mute further sound/haptic this session */
  muted: boolean
  setMuted: (m: boolean) => void
}

export function useThreatProximity(
  lat: number | undefined,
  lon: number | undefined,
  opts?: { enabled?: boolean; maxKm?: number },
): ThreatProximityState {
  const enabled = opts?.enabled !== false
  const maxKm = opts?.maxKm ?? MAX_KM
  const [loading, setLoading] = useState(false)
  const [warnings, setWarnings] = useState<StormWarning[]>([])
  const [threats, setThreats] = useState<NearbyThreat[]>([])
  const [muted, setMuted] = useState(false)
  const notifiedRef = useRef(loadNotified())
  const mutedRef = useRef(muted)
  mutedRef.current = muted

  const evaluate = useCallback(
    async (list: StormWarning[], la: number, lo: number) => {
      const near = findNearbyThreats(la, lo, list, maxKm)
      setThreats(near)

      for (const t of near.slice(0, 3)) {
        const id = t.warning.id
        if (notifiedRef.current.has(id)) continue
        // Only notify for warnings (not distant watches) or inside watch
        if (t.warning.significance === 'A' && !t.inside && t.distanceKm > 15) continue
        if (t.distanceKm > maxKm) continue

        notifiedRef.current.add(id)
        saveNotified(notifiedRef.current)

        if (!mutedRef.current) {
          const urgent =
            t.warning.phenomena === 'TO' ||
            t.warning.isEmergency ||
            t.warning.isPds ||
            t.inside
          void heavyHaptic()
          playThreatTone(urgent)
          const distLabel = t.inside
            ? 'YOU ARE IN THIS POLYGON'
            : `~${Math.round(t.distanceKm)} km away`
          void showLocalAlert(
            `Solara: ${t.warning.label}`,
            `${distLabel}${t.warning.wfo ? ` · ${t.warning.wfo}` : ''}`,
            id,
          )
        }
      }
    },
    [maxKm],
  )

  const refresh = useCallback(() => {
    if (!enabled || lat == null || lon == null || Number.isNaN(lat) || Number.isNaN(lon)) {
      setWarnings([])
      setThreats([])
      return
    }
    setLoading(true)
    void fetchAllThreatPolygons(lat, lon)
      .then((list) => {
        setWarnings(list)
        return evaluate(list, lat, lon)
      })
      .finally(() => setLoading(false))
  }, [enabled, lat, lon, evaluate])

  useEffect(() => {
    refresh()
    if (!enabled) return
    const id = window.setInterval(() => {
      if (!document.hidden) refresh()
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [refresh, enabled])

  return {
    loading,
    warnings,
    threats,
    nearest: threats[0] ?? null,
    refresh,
    muted,
    setMuted,
  }
}
