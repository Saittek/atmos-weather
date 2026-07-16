import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** When true, mount immediately (e.g. storm mode radar) */
  force?: boolean
  /** How far before entering the viewport to mount */
  rootMargin?: string
  /** Placeholder height so layout doesn't jump */
  minHeight?: number | string
  className?: string
  id?: string
  style?: CSSProperties
  placeholder?: ReactNode
}

/**
 * Mounts children only once they approach the viewport.
 * Keeps Leaflet / heavy panels off the critical path.
 */
export function Deferred({
  children,
  force = false,
  rootMargin = '280px 0px',
  minHeight,
  className,
  id,
  style,
  placeholder,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [show, setShow] = useState(force)

  useEffect(() => {
    if (force) {
      setShow(true)
      return
    }
    if (show) return
    const el = ref.current
    if (!el) return

    if (typeof IntersectionObserver === 'undefined') {
      setShow(true)
      return
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true)
          io.disconnect()
        }
      },
      { root: null, rootMargin, threshold: 0.01 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [force, rootMargin, show])

  return (
    <div
      ref={ref}
      id={id}
      className={className}
      style={{
        minHeight: show ? undefined : minHeight,
        ...style,
      }}
    >
      {show ? children : placeholder}
    </div>
  )
}
