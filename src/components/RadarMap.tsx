/**
 * Dashboard / page radar — MapLibre SolaraRadar with an isolated crash boundary.
 */
import { ErrorBoundary } from './ErrorBoundary'
import { SolaraRadar, type SolaraRadarProps } from '../radar'

export type { SolaraRadarProps as RadarMapProps } from '../radar'
export type { MapFocusRequest } from '../radar'

export function RadarMap(props: SolaraRadarProps) {
  return (
    <ErrorBoundary compact label="Radar hit a problem">
      <SolaraRadar {...props} />
    </ErrorBoundary>
  )
}
