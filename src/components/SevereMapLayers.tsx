/**
 * Map overlays: NWS/SPC/ECCC warning & watch polygons, SPC reports,
 * SPC Day 1 outlook, nearest-site velocity tiles, NEXRAD storm tracks.
 */
import { Fragment, useEffect, useMemo, useState } from 'react'
import { CircleMarker, GeoJSON, Popup, Polyline, useMap } from 'react-leaflet'
import type { Layer, PathOptions } from 'leaflet'
import {
  fetchAllThreatPolygons,
  fetchNexradStormTracks,
  fetchSpcOutlooks,
  fetchSpcStormReports,
  reportColor,
  stormCellColor,
  stormMotionTip,
  warningStyle,
  type SpcOutlookFeature,
  type StormCellTrack,
  type StormReport,
  type StormWarning,
} from '../api/severeLayers'
import { VelocityLayer } from './VelocityLayer'
import type { NexradSite, VelocityProduct } from '../api/severeLayers'

export interface SevereLayerToggles {
  warnings: boolean
  reports: boolean
  outlook: boolean
  velocity: boolean
  /** NEXRAD storm attribute cells + motion vectors (US) */
  tracks: boolean
}

export interface SevereLayerStats {
  warnings: number
  reports: number
  outlook: number
  tracks: number
  velocitySite: string | null
  velocityKm: number | null
  velocityMode: 'srm' | 'base' | null
  velocityName: string | null
}

export interface MapFocusRequest {
  lat: number
  lon: number
  zoom?: number
  /** Increment to re-trigger same coords */
  token: number
}

interface Props {
  lat: number
  lon: number
  toggles: SevereLayerToggles
  wide?: boolean
  onStats?: (s: SevereLayerStats) => void
  /** When set, fly map to this point (jump to threat) */
  focus?: MapFocusRequest | null
  /** External warning list (optional) — still loads if empty */
  externalWarnings?: StormWarning[] | null
}

type GjGeometry = {
  type: string
  coordinates?: unknown
  geometries?: GjGeometry[]
}

type GjFeature = {
  type: 'Feature'
  properties: Record<string, unknown>
  geometry: GjGeometry
}

function warningToFeature(w: StormWarning): GjFeature {
  return {
    type: 'Feature',
    properties: {
      id: w.id,
      label: w.label,
      phenomena: w.phenomena,
      significance: w.significance,
      expire: w.expire,
      tags: [w.tornadoTag, w.hailTag, w.windTag].filter(Boolean).join(' · '),
      href: w.href,
      emergency: w.isEmergency || w.isPds,
    },
    geometry: w.geometry as GjGeometry,
  }
}

function outlookToFeature(o: SpcOutlookFeature): GjFeature {
  return {
    type: 'Feature',
    properties: {
      id: o.id,
      label: o.label,
      fill: o.fill,
      stroke: o.stroke,
    },
    geometry: o.geometry as GjGeometry,
  }
}

function bindWarningPopup(feature: GjFeature, layer: Layer) {
  const p = feature.properties ?? {}
  const tags = p.tags ? `<br/><em>${String(p.tags)}</em>` : ''
  const exp =
    p.expire != null
      ? `<br/>Until ${new Date(String(p.expire)).toLocaleString()}`
      : ''
  const em = p.emergency ? ' ⚠ PDS/Emergency' : ''
  const link = p.href
    ? `<br/><a href="${String(p.href)}" target="_blank" rel="noreferrer">Details</a>`
    : ''
  layer.bindPopup(
    `<strong>${String(p.label ?? 'Warning')}${em}</strong>${tags}${exp}${link}`,
  )
}

function MapFocus({ focus }: { focus: MapFocusRequest | null | undefined }) {
  const map = useMap()
  useEffect(() => {
    if (!focus) return
    map.flyTo([focus.lat, focus.lon], focus.zoom ?? 8, {
      duration: 0.85,
    })
  }, [focus?.token, focus?.lat, focus?.lon, focus?.zoom, map, focus])
  return null
}

export function SevereMapLayers({
  lat,
  lon,
  toggles,
  wide = false,
  onStats,
  focus,
  externalWarnings,
}: Props) {
  const [warnings, setWarnings] = useState<StormWarning[]>([])
  const [reports, setReports] = useState<StormReport[]>([])
  const [tracks, setTracks] = useState<StormCellTrack[]>([])
  const [outlookTorn, setOutlookTorn] = useState<SpcOutlookFeature[]>([])
  const [outlookCat, setOutlookCat] = useState<SpcOutlookFeature[]>([])
  const [velSite, setVelSite] = useState<string | null>(null)
  const [velKm, setVelKm] = useState<number | null>(null)
  const [velMode, setVelMode] = useState<'srm' | 'base' | null>(null)
  const [velName, setVelName] = useState<string | null>(null)

  useEffect(() => {
    if (externalWarnings && externalWarnings.length) {
      setWarnings(externalWarnings)
    }
  }, [externalWarnings])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const tasks: Promise<void>[] = []
      if (toggles.warnings) {
        tasks.push(
          fetchAllThreatPolygons(lat, lon).then((w) => {
            if (!cancelled) setWarnings(w)
          }),
        )
      } else if (!cancelled && !externalWarnings?.length) setWarnings([])

      if (toggles.reports) {
        tasks.push(
          fetchSpcStormReports().then((r) => {
            if (!cancelled) setReports(r)
          }),
        )
      } else if (!cancelled) setReports([])

      if (toggles.outlook) {
        tasks.push(
          fetchSpcOutlooks().then((o) => {
            if (!cancelled) {
              setOutlookTorn(o.tornado)
              setOutlookCat(o.categorical)
            }
          }),
        )
      } else if (!cancelled) {
        setOutlookTorn([])
        setOutlookCat([])
      }

      if (toggles.tracks) {
        tasks.push(
          fetchNexradStormTracks().then((t) => {
            if (!cancelled) setTracks(t)
          }),
        )
      } else if (!cancelled) setTracks([])

      await Promise.all(tasks)
    }
    void load()
    const id = window.setInterval(() => {
      if (!document.hidden) void load()
    }, 3 * 60_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [
    toggles.warnings,
    toggles.reports,
    toggles.outlook,
    toggles.tracks,
    lat,
    lon,
    externalWarnings?.length,
  ])

  const visibleReports = useMemo(() => {
    if (!toggles.reports) return []
    if (wide) return reports.slice(0, 400)
    const radius = 8
    return reports
      .filter(
        (r) =>
          Math.abs(r.lat - lat) < radius && Math.abs(r.lon - lon) < radius * 1.4,
      )
      .slice(0, 250)
  }, [reports, lat, lon, wide, toggles.reports])

  const visibleTracks = useMemo(() => {
    if (!toggles.tracks) return []
    if (wide) {
      // Prefer strong / rotating cells nationwide
      return [...tracks]
        .sort((a, b) => {
          const sa =
            (a.tvs && a.tvs !== 'NONE' ? 1000 : 0) +
            (a.meso && a.meso !== 'NONE' ? 500 : 0) +
            (a.maxDbz ?? 0)
          const sb =
            (b.tvs && b.tvs !== 'NONE' ? 1000 : 0) +
            (b.meso && b.meso !== 'NONE' ? 500 : 0) +
            (b.maxDbz ?? 0)
          return sb - sa
        })
        .slice(0, 350)
    }
    const radius = 6
    return tracks
      .filter(
        (t) =>
          Math.abs(t.lat - lat) < radius && Math.abs(t.lon - lon) < radius * 1.4,
      )
      .slice(0, 180)
  }, [tracks, lat, lon, wide, toggles.tracks])

  const outlookFeatures = outlookTorn.length ? outlookTorn : outlookCat

  useEffect(() => {
    onStats?.({
      warnings: warnings.length,
      reports: visibleReports.length,
      outlook: outlookFeatures.length,
      tracks: visibleTracks.length,
      velocitySite: toggles.velocity ? velSite : null,
      velocityKm: toggles.velocity ? velKm : null,
      velocityMode: toggles.velocity ? velMode : null,
      velocityName: toggles.velocity ? velName : null,
    })
  }, [
    warnings.length,
    visibleReports.length,
    outlookFeatures.length,
    visibleTracks.length,
    velSite,
    velKm,
    velMode,
    velName,
    toggles.velocity,
    onStats,
  ])

  const onVelStatus = useMemo(
    () =>
      (s: { site: NexradSite | null; km: number | null; product: VelocityProduct }) => {
        setVelSite(s.site?.id ?? null)
        setVelName(s.site?.name ?? null)
        setVelKm(s.km)
        setVelMode(s.product === 'n0u' ? 'base' : 'srm')
      },
    [],
  )

  const warningFc = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: warnings.map(warningToFeature),
    }),
    [warnings],
  )

  const outlookFc = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: outlookFeatures.map(outlookToFeature),
    }),
    [outlookFeatures],
  )

  const warningStyleFn = (feature?: { properties?: { id?: string } }): PathOptions => {
    const id = feature?.properties?.id
    const w = warnings.find((x) => x.id === id)
    if (!w) return { color: '#f87171', weight: 2, fillOpacity: 0.12 }
    const s = warningStyle(w)
    return {
      color: s.color,
      fillColor: s.fillColor,
      weight: s.weight,
      fillOpacity: s.fillOpacity,
      dashArray: s.dashArray,
      opacity: 0.95,
    }
  }

  const outlookStyleFn = (feature?: {
    properties?: { fill?: string; stroke?: string }
  }): PathOptions => {
    const fill = feature?.properties?.fill || 'rgba(250,204,21,0.15)'
    const stroke = feature?.properties?.stroke || 'rgba(255,255,255,0.3)'
    return {
      color: stroke,
      fillColor: fill,
      fillOpacity: 1,
      weight: 1.5,
      opacity: 0.7,
    }
  }

  const warnKey = `w-${warnings.length}-${warnings[0]?.id ?? '0'}-${warnings.filter((w) => w.significance === 'A').length}`
  const outKey = `o-${outlookFeatures.length}-${outlookFeatures[0]?.id ?? '0'}`

  return (
    <>
      <MapFocus focus={focus} />

      <VelocityLayer
        lat={lat}
        lon={lon}
        enabled={toggles.velocity}
        onStatus={onVelStatus}
      />

      {toggles.outlook && outlookFeatures.length > 0 && (
        <GeoJSON
          key={outKey}
          data={outlookFc as GeoJSON.FeatureCollection}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          style={outlookStyleFn as any}
          onEachFeature={(feature, layer) => {
            const label =
              (feature.properties as { label?: string } | null)?.label ?? 'SPC risk'
            layer.bindPopup(
              `<strong>SPC Day 1</strong><br/>${label}<br/><small>Outlook risk — not a warning</small>`,
            )
          }}
        />
      )}

      {toggles.warnings && warnings.length > 0 && (
        <GeoJSON
          key={warnKey}
          data={warningFc as GeoJSON.FeatureCollection}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          style={warningStyleFn as any}
          onEachFeature={(feature, layer) =>
            bindWarningPopup(feature as unknown as GjFeature, layer)
          }
        />
      )}

      {toggles.reports &&
        visibleReports.map((r) => (
          <CircleMarker
            key={r.id}
            center={[r.lat, r.lon]}
            radius={r.kind === 'tornado' ? 7 : 5}
            pathOptions={{
              color: '#0f172a',
              weight: 1,
              fillColor: reportColor(r.kind),
              fillOpacity: 0.92,
            }}
          >
            <Popup>
              <strong>
                {r.kind === 'tornado'
                  ? '🌪 Tornado'
                  : r.kind === 'hail'
                    ? '🧊 Hail'
                    : '💨 Wind'}{' '}
                report
              </strong>
              <br />
              {r.location}
              {r.county ? `, ${r.county}` : ''} {r.state}
              <br />
              {r.magnitude
                ? r.kind === 'hail'
                  ? `Size ${r.magnitude}"`
                  : r.kind === 'wind'
                    ? `${r.magnitude} mph`
                    : `Scale ${r.magnitude}`
                : null}
              {r.timeUtc ? ` · ${r.timeUtc}Z` : null}
              {r.comments ? (
                <>
                  <br />
                  <em>{r.comments.slice(0, 180)}</em>
                </>
              ) : null}
              <br />
              <small>SPC local storm report — may be delayed</small>
            </Popup>
          </CircleMarker>
        ))}

      {toggles.tracks &&
        visibleTracks.map((c) => {
          const color = stormCellColor(c)
          const hasMotion =
            c.drct != null && c.sknt != null && c.sknt > 0 && Number.isFinite(c.drct)
          const tip = hasMotion
            ? stormMotionTip(c.lat, c.lon, c.drct!, c.sknt!, 30)
            : null
          return (
            <Fragment key={c.id}>
              {tip && (
                <Polyline
                  positions={[
                    [c.lat, c.lon],
                    tip,
                  ]}
                  pathOptions={{
                    color,
                    weight: 2,
                    opacity: 0.85,
                    dashArray: '4 3',
                  }}
                />
              )}
              <CircleMarker
                center={[c.lat, c.lon]}
                radius={
                  c.tvs && c.tvs !== 'NONE'
                    ? 8
                    : c.meso && c.meso !== 'NONE'
                      ? 7
                      : 5
                }
                pathOptions={{
                  color: '#0f172a',
                  weight: 1.5,
                  fillColor: color,
                  fillOpacity: 0.95,
                }}
              >
                <Popup>
                  <strong>
                    Storm {c.stormId || '?'} · {c.nexrad}
                  </strong>
                  <br />
                  {c.maxDbz != null ? `Max ${Math.round(c.maxDbz)} dBZ` : 'Cell'}
                  {c.vil != null ? ` · VIL ${c.vil}` : ''}
                  {c.topKft != null ? ` · Top ${c.topKft} kft` : ''}
                  <br />
                  {hasMotion
                    ? `Motion ${Math.round(c.drct!)}° at ${Math.round(c.sknt!)} kt (vector ≈ 30 min)`
                    : 'No motion vector'}
                  {c.tvs && c.tvs !== 'NONE' ? (
                    <>
                      <br />
                      <em>TVS: {c.tvs}</em>
                    </>
                  ) : null}
                  {c.meso && c.meso !== 'NONE' ? (
                    <>
                      <br />
                      <em>MESO: {c.meso}</em>
                    </>
                  ) : null}
                  {(c.posh ?? 0) > 0 ? (
                    <>
                      <br />
                      POSH {c.posh}%{c.poh != null ? ` · POH ${c.poh}%` : ''}
                    </>
                  ) : null}
                  {c.valid ? (
                    <>
                      <br />
                      <small>{c.valid}</small>
                    </>
                  ) : null}
                  <br />
                  <small>NEXRAD storm attributes (IEM) — open NWS-derived data</small>
                </Popup>
              </CircleMarker>
            </Fragment>
          )
        })}

    </>
  )
}
