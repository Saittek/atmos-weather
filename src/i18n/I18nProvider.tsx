import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  detectLocale,
  saveLocale,
  t as translate,
  type LocaleId,
  type MessageKey,
} from './messages'

interface I18nCtx {
  locale: LocaleId
  setLocale: (l: LocaleId) => void
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
}

const Ctx = createContext<I18nCtx | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleId>(() => detectLocale())

  const setLocale = useCallback((l: LocaleId) => {
    setLocaleState(l)
    saveLocale(l)
  }, [])

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  )

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n(): I18nCtx {
  const ctx = useContext(Ctx)
  if (!ctx) {
    // Fallback when used outside provider (tests / edge)
    return {
      locale: 'en',
      setLocale: () => {},
      t: (key, vars) => translate('en', key, vars),
    }
  }
  return ctx
}
