/**
 * Lightweight UI strings — English + Canadian French.
 * Expand keys as needed; missing keys fall back to English.
 */

export type LocaleId = 'en' | 'fr'

export const LOCALE_LABELS: Record<LocaleId, string> = {
  en: 'English',
  fr: 'Français (Canada)',
}

const en = {
  'app.loading': 'Loading Solara…',
  'nav.radar': 'Radar',
  'nav.stargaze': 'Stargaze',
  'nav.earth': 'Earth',
  'nav.chase': 'Chase',
  'nav.modes': 'App modes',
  'hero.rightNow': 'Right now',
  'hero.today': 'Today at a glance',
  'hero.todayHL': 'Today H {h} · L {l}',
  'settings.open': 'Open settings',
  'settings.explore': 'Explore',
  'settings.units': 'Units',
  'settings.theme': 'Theme',
  'settings.language': 'Language',
  'settings.plan': 'Plan',
  'settings.planFree': 'Solara Free',
  'settings.planPro': 'Solara Pro',
  'settings.planHintFree':
    'Core weather, radar, Earth, alerts, and chat stay free. Pro adds extras — payment comes later.',
  'settings.planHintPro':
    'Pro preview: extended radar history, more favorites, multi-widget, ad-free when ads ship.',
  'settings.previewPro': 'Preview Pro (no charge)',
  'settings.backFree': 'Back to Free',
  'settings.stargaze': '✨ Stargaze · night sky & astro',
  'settings.radar': '📡 Full-page radar',
  'settings.earth': '🌍 3D Earth · global radar',
  'settings.chase': '🌪 Storm chasers desk',
  'auth.welcome': 'Welcome back',
  'auth.create': 'Create account',
  'auth.signIn': 'Sign in',
  'auth.forgot': 'Forgot password?',
  'auth.resetSend': 'Email reset link',
  'auth.resetHint':
    'We’ll email a one-time link if that address has an account. Link expires in 1 hour.',
  'auth.sub': 'Sync home pin, favorites, last place, units, and theme across devices.',
  'empty.title': 'Where should we look?',
  'empty.lead': 'Search a city or use your location for forecasts, radar, and alerts.',
  'empty.location': 'Use my location',
  'empty.radar': 'Open radar',
  'empty.stargaze': '✨ Stargaze',
  'fresh.offline':
    'You’re offline — showing the last saved forecast. Reconnect and pull down to refresh.',
  'fresh.stale':
    'Forecast may be outdated. Pull down from the top to refresh.',
  'account.changePassword': 'Change password',
  'account.sync': 'Sync now',
  'account.signOut': 'Sign out',
  'pro.favoritesCap': 'Free plan allows {n} saved places. Preview Pro for more.',
} as const

export type MessageKey = keyof typeof en

const fr: Partial<Record<MessageKey, string>> = {
  'app.loading': 'Chargement de Solara…',
  'nav.radar': 'Radar',
  'nav.stargaze': 'Ciel étoilé',
  'nav.earth': 'Terre',
  'nav.chase': 'Tempêtes',
  'nav.modes': 'Modes de l’app',
  'hero.rightNow': 'En ce moment',
  'hero.today': 'Aujourd’hui en un coup d’œil',
  'hero.todayHL': 'Aujourd’hui max {h} · min {l}',
  'settings.open': 'Ouvrir les réglages',
  'settings.explore': 'Explorer',
  'settings.units': 'Unités',
  'settings.theme': 'Thème',
  'settings.language': 'Langue',
  'settings.plan': 'Forfait',
  'settings.planFree': 'Solara Gratuit',
  'settings.planPro': 'Solara Pro',
  'settings.planHintFree':
    'Météo de base, radar, Terre, alertes et clavardage restent gratuits. Pro arrive plus tard — pas de paiement encore.',
  'settings.planHintPro':
    'Aperçu Pro : historique radar prolongé, plus de favoris, multi-widget, sans pub plus tard.',
  'settings.previewPro': 'Aperçu Pro (sans frais)',
  'settings.backFree': 'Revenir au gratuit',
  'settings.stargaze': '✨ Ciel étoilé · astrophoto',
  'settings.radar': '📡 Radar plein écran',
  'settings.earth': '🌍 Terre 3D · radar mondial',
  'settings.chase': '🌪 Bureau chasseurs d’orages',
  'auth.welcome': 'Bon retour',
  'auth.create': 'Créer un compte',
  'auth.signIn': 'Connexion',
  'auth.forgot': 'Mot de passe oublié?',
  'auth.resetSend': 'Envoyer le lien',
  'auth.resetHint':
    'Nous enverrons un lien unique si ce courriel a un compte. Expire dans 1 heure.',
  'auth.sub':
    'Synchronisez domicile, favoris, dernier lieu, unités et thème entre appareils.',
  'empty.title': 'Où regardons-nous?',
  'empty.lead':
    'Cherchez une ville ou utilisez votre position pour les prévisions, le radar et les alertes.',
  'empty.location': 'Ma position',
  'empty.radar': 'Ouvrir le radar',
  'empty.stargaze': '✨ Ciel étoilé',
  'fresh.offline':
    'Hors ligne — dernière prévision enregistrée. Reconnectez-vous et tirez vers le bas pour actualiser.',
  'fresh.stale':
    'Prévision peut-être périmée. Tirez vers le bas pour actualiser.',
  'account.changePassword': 'Changer le mot de passe',
  'account.sync': 'Synchroniser',
  'account.signOut': 'Déconnexion',
  'pro.favoritesCap': 'Le forfait gratuit permet {n} lieux. Aperçu Pro pour en ajouter.',
}

const catalogs: Record<LocaleId, Record<MessageKey, string>> = {
  en: { ...en },
  fr: { ...en, ...fr },
}

export function t(
  locale: LocaleId,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const raw = catalogs[locale]?.[key] ?? en[key] ?? key
  if (!vars) return raw
  return raw.replace(/\{(\w+)\}/g, (_, k: string) =>
    vars[k] != null ? String(vars[k]) : `{${k}}`,
  )
}

export function detectLocale(): LocaleId {
  try {
    const stored = localStorage.getItem('solara-locale-v1')
    if (stored === 'en' || stored === 'fr') return stored
  } catch {
    /* ignore */
  }
  try {
    const nav = (navigator.language || 'en').toLowerCase()
    if (nav.startsWith('fr')) return 'fr'
  } catch {
    /* ignore */
  }
  return 'en'
}

export function saveLocale(locale: LocaleId) {
  try {
    localStorage.setItem('solara-locale-v1', locale)
    document.documentElement.lang = locale === 'fr' ? 'fr-CA' : 'en'
  } catch {
    /* ignore */
  }
}
