/**
 * Toggle optional dashboard modules (saved locally).
 */
import type { ModuleId, ModulePrefs } from '../lib/modulePrefs'
import { MODULE_LABELS } from '../lib/modulePrefs'

interface Props {
  prefs: ModulePrefs
  onChange: (next: ModulePrefs) => void
}

export function ModulePrefsPanel({ prefs, onChange }: Props) {
  const toggle = (id: ModuleId) => {
    onChange({ ...prefs, [id]: !prefs[id] })
  }

  return (
    <section className="panel module-prefs-panel" aria-label="Dashboard modules">
      <div className="panel-header">
        <h2>Show on home</h2>
        <span className="panel-hint">Optional extras</span>
      </div>
      <p className="module-prefs-lead muted-center">
        Keep the home feed calm. Turn on only what you use.
      </p>
      <ul className="module-prefs-list">
        {MODULE_LABELS.map((m) => (
          <li key={m.id}>
            <label className="module-prefs-row">
              <input
                type="checkbox"
                checked={Boolean(prefs[m.id])}
                onChange={() => toggle(m.id)}
              />
              <span>
                <strong>{m.label}</strong>
                <em>{m.hint}</em>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  )
}
