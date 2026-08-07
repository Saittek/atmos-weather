/**
 * Toggle optional dashboard modules (saved locally).
 */
import type { ModuleId, ModulePrefs } from '../lib/modulePrefs'
import { MODULE_LABELS } from '../lib/modulePrefs'
import { useI18n } from '../i18n/I18nProvider'
import type { MessageKey } from '../i18n/messages'

const MOD_KEYS: Record<ModuleId, { label: MessageKey; hint: MessageKey }> = {
  dress: { label: 'mod.dress', hint: 'mod.dressHint' },
  videos: { label: 'mod.videos', hint: 'mod.videosHint' },
  fireMap: { label: 'mod.fireMap', hint: 'mod.fireMapHint' },
  chat: { label: 'mod.chat', hint: 'mod.chatHint' },
  shareCard: { label: 'mod.shareCard', hint: 'mod.shareCardHint' },
  models: { label: 'mod.models', hint: 'mod.modelsHint' },
  planning: { label: 'mod.planning', hint: 'mod.planningHint' },
}

interface Props {
  prefs: ModulePrefs
  onChange: (next: ModulePrefs) => void
}

export function ModulePrefsPanel({ prefs, onChange }: Props) {
  const { t } = useI18n()
  const toggle = (id: ModuleId) => {
    onChange({ ...prefs, [id]: !prefs[id] })
  }

  return (
    <section className="panel module-prefs-panel" aria-label={t('settings.modules')}>
      <div className="panel-header">
        <h2>{t('settings.modules')}</h2>
        <span className="panel-hint">{t('settings.modulesHint')}</span>
      </div>
      <p className="module-prefs-lead muted-center">{t('settings.modulesLead')}</p>
      <ul className="module-prefs-list">
        {MODULE_LABELS.map((m) => {
          const keys = MOD_KEYS[m.id]
          return (
            <li key={m.id}>
              <label className="module-prefs-row">
                <input
                  type="checkbox"
                  checked={Boolean(prefs[m.id])}
                  onChange={() => toggle(m.id)}
                />
                <span>
                  <strong>{t(keys.label)}</strong>
                  <em>{t(keys.hint)}</em>
                </span>
              </label>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
