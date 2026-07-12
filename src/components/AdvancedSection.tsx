import { useState, type ReactNode } from 'react'

interface Props {
  title?: string
  defaultOpen?: boolean
  children: ReactNode
  id?: string
}

/** Collapsible “More / Advanced” region to keep the home feed focused */
export function AdvancedSection({
  title = 'More details',
  defaultOpen = false,
  children,
  id = 'advanced-weather',
}: Props) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className={`advanced-section ${open ? 'is-open' : ''}`} id={id}>
      <button
        type="button"
        className="advanced-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={`${id}-body`}
      >
        <span>
          <strong>{title}</strong>
          <em>Models, climate, pollen, trip tools & more</em>
        </span>
        <span className="advanced-chevron" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <div className="advanced-body" id={`${id}-body`}>
          {children}
        </div>
      )}
    </section>
  )
}
