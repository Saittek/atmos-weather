/** Lightweight loading placeholders */
export function Skeleton({
  className = '',
  height,
  width,
  round,
}: {
  className?: string
  height?: string | number
  width?: string | number
  round?: boolean
}) {
  return (
    <span
      className={`skeleton ${round ? 'skeleton-round' : ''} ${className}`}
      style={{
        height: typeof height === 'number' ? `${height}px` : height,
        width: typeof width === 'number' ? `${width}px` : width ?? '100%',
      }}
      aria-hidden
    />
  )
}

export function DashboardSkeleton() {
  return (
    <div className="dashboard dashboard-skeleton" aria-busy="true" aria-label="Loading weather">
      <div className="col main-col">
        <section className="panel current-hero skeleton-panel">
          <div className="skeleton-hero-row">
            <div className="skeleton-hero-text">
              <Skeleton height={28} width="55%" />
              <Skeleton height={16} width="40%" />
              <Skeleton height={16} width="70%" />
              <div className="skeleton-chip-row">
                <Skeleton height={26} width={80} round />
                <Skeleton height={26} width={100} round />
              </div>
            </div>
            <Skeleton height={140} width={140} round className="skeleton-orb" />
          </div>
          <Skeleton height={64} width="45%" className="skeleton-temp" />
        </section>
        <section className="panel skeleton-panel">
          <Skeleton height={20} width="40%" />
          <Skeleton height={48} />
          <Skeleton height={72} />
        </section>
        <section className="panel skeleton-panel">
          <Skeleton height={20} width="35%" />
          <Skeleton height={200} />
        </section>
      </div>
      <aside className="col side-col">
        <section className="panel skeleton-panel">
          <Skeleton height={20} width="50%" />
          <Skeleton height={36} />
          <Skeleton height={36} />
          <Skeleton height={36} />
        </section>
        <section className="panel skeleton-panel">
          <Skeleton height={20} width="45%" />
          <Skeleton height={160} />
        </section>
      </aside>
    </div>
  )
}
