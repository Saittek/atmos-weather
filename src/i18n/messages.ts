/**
 * Full UI catalogs — English + Canadian French.
 * When locale is `fr`, all keys resolve to French (no English leftovers in catalog).
 */

export type LocaleId = 'en' | 'fr'

export const LOCALE_LABELS: Record<LocaleId, string> = {
  en: 'English',
  fr: 'Français (Canada)',
}

export function localeTag(locale: LocaleId): string {
  return locale === 'fr' ? 'fr-CA' : 'en-CA'
}

const en = {
  // App shell
  'app.loading': 'Loading Solara…',
  'app.skipForecast': 'Skip to forecast',
  'app.brand': 'Solara',
  'app.stormMode': 'Storm mode',
  'app.stormBanner': 'Radar first · intense map · severe highlighting',
  'app.stormExit': 'Exit',
  'app.refresh': 'Refresh weather',
  'app.refreshing': 'Refreshing…',
  'app.updating': 'Updating…',
  'app.pullRefresh': 'Pull to refresh',
  'app.releaseRefresh': 'Release to refresh',
  'app.updated': 'Updated {ago}',
  'app.justNow': 'just now',
  'app.offline': 'offline',
  'app.local': 'Local',
  'app.sources': 'Sources',

  // Nav / modes
  'nav.radar': 'Radar',
  'nav.stargaze': 'Stargaze',
  'nav.earth': 'Earth',
  'nav.chase': 'Chase',
  'nav.modes': 'App modes',
  'nav.home': 'Go home',
  'nav.work': 'Go to work',
  'nav.fullRadar': 'Full-page radar',
  'nav.hideRadar': 'Hide radar',
  'nav.viewRadar': 'View radar',
  'nav.stormModeOn': '🌩 Storm mode',

  // Hero / current
  'hero.rightNow': 'Right now',
  'hero.today': 'Today at a glance',
  'hero.todayHL': 'Today H {h} · L {l}',
  'hero.feelsLike': 'Feels like {temp}',
  'hero.warmer': 'warmer than air',
  'hero.cooler': 'cooler than air',
  'hero.conditions': 'Conditions',
  'hero.setHome': 'Set this place as exact home',
  'hero.isHome': 'This is your exact home pin',
  'hero.saveFav': 'Save to favorites',
  'hero.removeFav': 'Remove from favorites',
  'hero.share': 'Share this place',
  'hero.copyLink': 'Copy share link',
  'hero.offlineBanner':
    'You’re offline — showing the last saved forecast. Reconnect and pull down to refresh.',
  'hero.staleBanner':
    'Forecast last updated {ago} — may be outdated. Pull down from the top to refresh.',
  'hero.offlineChip': 'Offline · last saved',
  'hero.staleChip': 'May be outdated · pull to refresh',
  'hero.alerts': '{n} alert',
  'hero.alerts_plural': '{n} alerts',
  'hero.quickStats': 'Quick stats',

  // Search
  'search.placeholder': 'Search city or place…',
  'search.myLocation': 'My location',
  'search.locating': 'Locating…',
  'search.recent': 'Recent',
  'search.noResults': 'No places found',
  'search.failed': 'Search failed — try again',
  'search.home': 'Home',

  // Empty
  'empty.title': 'Where should we look?',
  'empty.lead': 'Search a city or use your location for forecasts, radar, and alerts.',
  'empty.location': 'Use my location',
  'empty.radar': 'Open radar',
  'empty.stargaze': '✨ Stargaze',
  'empty.dismiss': 'Dismiss',
  'radar.ctaOff': 'Off until you open it',
  'radar.view': 'View radar',
  'radar.fullPage': 'Full page',

  // Favorites
  'fav.title': '★ Saved places',
  'fav.local': 'local',
  'fav.empty': 'Save places with ☆ on the place card or in Settings.',
  'fav.emptyHome': 'Star any location to pin work, trips, or other spots under home.',
  'fav.emptyNoHome': 'Star any location to pin home, work, or trip spots here.',
  'fav.accountHint': ' Create an account to keep them across devices.',
  'fav.minimize': 'Minimize',
  'fav.expand': 'Expand',
  'fav.remove': 'Remove',

  // Settings
  'settings.open': 'Open settings',
  'settings.title': 'Settings',
  'settings.done': 'Done',
  'settings.close': 'Close settings',
  'settings.explore': 'Explore',
  'settings.units': 'Units',
  'settings.theme': 'Theme',
  'settings.language': 'Language',
  'settings.density': 'Density',
  'settings.comfortable': 'Comfortable',
  'settings.compact': 'Compact',
  'settings.themeDark': '☾ Dark',
  'settings.themeLight': '☀ Light',
  'settings.themeAuto': 'A Auto',
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
  'settings.atmosphere': 'Weather atmosphere',
  'settings.atmosphereHint': 'Rain, snow & lightning wash behind the app',
  'settings.stormMode': 'Storm mode',
  'settings.stormModeHint': 'Radar-first layout',
  'settings.alertsUi': 'Alerts UI',
  'settings.alertsUiHint': 'Highlight severe weather',
  'settings.notify': 'Notify',
  'settings.notifyHint': 'Rain watch & alerts when closed (sign in for server push)',
  'settings.testNotify': 'Send test notification',
  'settings.workPin': 'Work pin',
  'settings.workIs': 'This place is Work — rain watch includes it',
  'settings.workReplace': 'Replace work with this place',
  'settings.workSet': 'Second pin for commute rain watch',
  'settings.clearWork': 'Clear work',
  'settings.setWork': 'Set work',
  'settings.goWork': 'Go to work',
  'settings.analyticsOff': 'Privacy analytics off',
  'settings.analyticsHint': "Don't send anonymous page usage (no location stored)",
  'settings.quietHours': 'Quiet hours',
  'settings.quietHint': 'Mute non-Extreme alerts overnight',
  'settings.from': 'From',
  'settings.to': 'To',
  'settings.home': 'Home',
  'settings.goHome': '🏠 Go to home',
  'settings.setHome': '🏠 Set this place as home',
  'settings.clearHome': '🏡 Clear home for this place',
  'settings.homeHint': 'Set home from the 🏠 Home panel or place card.',
  'settings.saveFav': '☆ Save this place to favorites',
  'settings.removeFav': '★ Remove this place from favorites',
  'settings.sync': '☁ Sync account now',
  'settings.synced': '☁ Sync account (up to date)',
  'settings.share': '↗ Copy share link',
  'settings.modules': 'Show on home',
  'settings.modulesHint': 'Optional extras',
  'settings.modulesLead': 'Keep the home feed calm. Turn on only what you use.',

  // Modules
  'mod.dress': 'Dress for today',
  'mod.dressHint': 'Clothing tips',
  'mod.videos': 'Weather videos',
  'mod.videosHint': 'Safety / explainers',
  'mod.fireMap': 'Always show fire map',
  'mod.fireMapHint': 'Otherwise only when smoky',
  'mod.chat': 'Area chat',
  'mod.chatHint': 'Local community',
  'mod.shareCard': 'Share card panel',
  'mod.shareCardHint': 'Big share block',
  'mod.models': 'Model compare',
  'mod.modelsHint': 'Multi-model detail',
  'mod.planning': 'Planning tools',
  'mod.planningHint': 'Trip, snow, climate',

  // Auth / account
  'auth.welcome': 'Welcome back',
  'auth.create': 'Create account',
  'auth.signIn': 'Sign in',
  'auth.forgot': 'Forgot password?',
  'auth.resetSend': 'Email reset link',
  'auth.resetHint':
    'We’ll email a one-time link if that address has an account. Link expires in 1 hour.',
  'auth.sub': 'Sync home pin, favorites, last place, units, and theme across devices.',
  'auth.name': 'Name',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.wait': 'Please wait…',
  'auth.backSignIn': '← Back to sign in',
  'auth.fullReset': 'Full reset page',
  'auth.hashed': 'Accounts are stored on your Solara server. Passwords are hashed — never stored plain text.',
  'auth.newPassword': 'New password',
  'auth.currentPassword': 'Current password',
  'auth.updatePassword': 'Update password',
  'auth.choosePassword': 'Choose a new password',
  'auth.resetDone': 'Password updated — you can sign in now',
  'auth.signInHome': 'Sign in on home',
  'account.changePassword': 'Change password',
  'account.sync': 'Sync now',
  'account.signOut': 'Sign out',
  'account.synced': '☁ Synced',
  'account.note': 'Favorites, last place, units & theme save to your account automatically.',
  'account.signingIn': 'Signing you in…',
  'account.pwHelp':
    'You must know your current password. Lost access? Use Forgot password, or email support.',

  // Forecast panels
  'panel.hourly': 'Hourly',
  'panel.daily': '14-day forecast',
  'panel.daily7': '7-day forecast',
  'panel.showMore': 'Show 14 days',
  'panel.showLess': 'Show 7 days',
  'panel.now': 'Now',
  'panel.today': 'Today',
  'panel.alerts': 'Alerts',
  'panel.air': 'Air quality',
  'panel.sunMoon': 'Sun, moon & daylight',
  'panel.radar': '📡 Radar',
  'panel.radarLoads': 'Radar loads when you scroll here…',
  'panel.loadingRadar': 'Loading live radar…',
  'panel.whatMatters': 'What matters now',
  'panel.weekend': 'Weekend',
  'panel.whatChanged': 'What changed',

  // Conditions detail cards
  'cond.wind': 'Wind',
  'cond.humidity': 'Humidity',
  'cond.pressure': 'Pressure',
  'cond.uv': 'UV Index',
  'cond.visibility': 'Visibility',
  'cond.clouds': 'Cloud cover',
  'cond.precip': 'Precipitation',
  'cond.feels': 'Feels like',
  'cond.dew': 'Dew point {temp}',
  'cond.gusts': 'Gusts {speed}',
  'cond.msl': 'Mean sea level',
  'cond.clear': 'Clear',
  'cond.moderate': 'Moderate',
  'cond.reduced': 'Reduced',
  'cond.mostlyClear': 'Mostly clear',
  'cond.partlyCloudy': 'Partly cloudy',
  'cond.cloudy': 'Cloudy',
  'cond.falling': 'Falling now',
  'cond.todayDry': 'Today dry',
  'cond.todayPrecip': 'Today {amount}',
  'cond.snow': 'Snow {amount}',
  'cond.actual': 'Actual {temp}',

  // UV / AQI (short)
  'uv.low': 'Low',
  'uv.moderate': 'Moderate',
  'uv.high': 'High',
  'uv.veryHigh': 'Very High',
  'uv.extreme': 'Extreme',
  'aqi.good': 'Good',
  'aqi.moderate': 'Moderate',
  'aqi.sensitive': 'Unhealthy for Sensitive',
  'aqi.unhealthy': 'Unhealthy',
  'aqi.veryUnhealthy': 'Very Unhealthy',
  'aqi.hazardous': 'Hazardous',

  // Radar legend
  'radar.source': 'Source',
  'radar.eccc': 'ECCC MSC GeoMet (Canada)',
  'radar.nexrad': 'NEXRAD / IEM (US)',
  'radar.ecccShort': 'ECCC MSC GeoMet',
  'radar.rainviewer': 'RainViewer / regional composite',
  'radar.fires': 'FIRMS fires',
  'radar.warnings': 'Warnings',

  // Pages
  'page.radar': 'Live radar',
  'page.earth': 'Earth',
  'page.chase': 'Storm chasers',
  'page.stargaze': 'Stargaze',
  'page.back': '← Dashboard',
  'page.loadingMap': 'Loading map…',

  // Freshness / pro
  'fresh.offline':
    'You’re offline — showing the last saved forecast. Reconnect and pull down to refresh.',
  'fresh.stale': 'Forecast may be outdated. Pull down from the top to refresh.',
  'pro.favoritesCap': 'Free plan allows {n} saved places. Preview Pro for more.',
  'pro.badge': 'Pro',
  'pro.free': 'Free',

  // First run
  'coach.kicker': 'Getting started · {n}/{total}',
  'coach.set': 'You’re set',
  'coach.setHome':
    'Set Home with the 🏠 on the place card so alerts, rain watch, and the widget use your pin.',
  'coach.setHomeDone':
    'Home is pinned. Solara will keep this place ready on open and on the widget.',
  'coach.modes': 'Modes on your phone',
  'coach.modesBody':
    'Under Today at a glance: Radar · Stargaze · Earth · Chase. Or ⚙ Settings → Explore.',
  'coach.homeWork': 'Home & Work',
  'coach.homeWorkBody':
    'Optional: open your office/school and use Settings → Work pin for commute rain watch.',
  'coach.homeWorkDone': 'Work is saved too — jump there from Settings for commute weather.',
  'coach.alerts': 'Alerts when closed',
  'coach.alertsOn': 'Notifications are on. Sign in so server push works when the app is closed.',
  'coach.alertsOff': 'Turn on Notify for rain watch and severe alerts — works best when signed in.',
  'coach.enableNotify': 'Enable notifications',
  'coach.widget': 'Home Screen widget',
  'coach.widgetBody':
    'Long-press Home Screen → Add Widget → Solara Weather. Open the app once so the tile fills in.',
  'coach.install': 'Install Solara',
  'coach.installBody':
    'Install to your home screen for one-tap weather. On iPhone Safari: Share → Add to Home Screen.',
  'coach.stargaze': 'Stargaze ✨',
  'coach.stargazeBody':
    'Plan the night: sky score, moon, Bortle, ISS. Tap ✨ Stargaze on the modes row or Settings → Explore.',
  'coach.next': 'Next',
  'coach.done': 'Done',
  'coach.skip': 'Skip',

  // Wet / precip generic fallbacks
  'wet.dryTitle': 'You should stay dry',
  'wet.maybeTitle': 'Mostly dry, small chance',
  'wet.wetTitle': 'You might get wet soon',
  'precip.dry': 'Looks dry through about {until}. Leave the umbrella.',
  'precip.dryShort': 'Dry next few hours',
} as const

export type MessageKey = keyof typeof en

const fr: Record<MessageKey, string> = {
  'app.loading': 'Chargement de Solara…',
  'app.skipForecast': 'Aller aux prévisions',
  'app.brand': 'Solara',
  'app.stormMode': 'Mode tempête',
  'app.stormBanner': 'Radar d’abord · carte intense · mise en évidence des alertes',
  'app.stormExit': 'Quitter',
  'app.refresh': 'Actualiser la météo',
  'app.refreshing': 'Actualisation…',
  'app.updating': 'Mise à jour…',
  'app.pullRefresh': 'Tirez pour actualiser',
  'app.releaseRefresh': 'Relâchez pour actualiser',
  'app.updated': 'Mis à jour {ago}',
  'app.justNow': 'à l’instant',
  'app.offline': 'hors ligne',
  'app.local': 'Heure locale',
  'app.sources': 'Sources',

  'nav.radar': 'Radar',
  'nav.stargaze': 'Ciel étoilé',
  'nav.earth': 'Terre',
  'nav.chase': 'Tempêtes',
  'nav.modes': 'Modes de l’app',
  'nav.home': 'Aller à la maison',
  'nav.work': 'Aller au travail',
  'nav.fullRadar': 'Radar plein écran',
  'nav.hideRadar': 'Masquer le radar',
  'nav.viewRadar': 'Voir le radar',
  'nav.stormModeOn': '🌩 Mode tempête',

  'hero.rightNow': 'En ce moment',
  'hero.today': 'Aujourd’hui en un coup d’œil',
  'hero.todayHL': 'Aujourd’hui max {h} · min {l}',
  'hero.feelsLike': 'Ressenti {temp}',
  'hero.warmer': 'plus chaud que l’air',
  'hero.cooler': 'plus froid que l’air',
  'hero.conditions': 'Conditions',
  'hero.setHome': 'Définir ce lieu comme domicile exact',
  'hero.isHome': 'C’est votre domicile exact',
  'hero.saveFav': 'Ajouter aux favoris',
  'hero.removeFav': 'Retirer des favoris',
  'hero.share': 'Partager ce lieu',
  'hero.copyLink': 'Copier le lien',
  'hero.offlineBanner':
    'Hors ligne — dernière prévision enregistrée. Reconnectez-vous et tirez vers le bas pour actualiser.',
  'hero.staleBanner':
    'Dernière mise à jour {ago} — peut être périmée. Tirez vers le bas pour actualiser.',
  'hero.offlineChip': 'Hors ligne · dernière sauvegarde',
  'hero.staleChip': 'Peut être périmée · tirez pour actualiser',
  'hero.alerts': '{n} alerte',
  'hero.alerts_plural': '{n} alertes',
  'hero.quickStats': 'Aperçu rapide',

  'search.placeholder': 'Rechercher une ville ou un lieu…',
  'search.myLocation': 'Ma position',
  'search.locating': 'Localisation…',
  'search.recent': 'Récents',
  'search.noResults': 'Aucun lieu trouvé',
  'search.failed': 'Échec de la recherche — réessayez',
  'search.home': 'Domicile',

  'empty.title': 'Où regardons-nous?',
  'empty.lead':
    'Cherchez une ville ou utilisez votre position pour les prévisions, le radar et les alertes.',
  'empty.location': 'Ma position',
  'empty.radar': 'Ouvrir le radar',
  'empty.stargaze': '✨ Ciel étoilé',
  'empty.dismiss': 'Fermer',
  'radar.ctaOff': 'Masqué jusqu’à ouverture',
  'radar.view': 'Voir le radar',
  'radar.fullPage': 'Plein écran',

  'fav.title': '★ Lieux enregistrés',
  'fav.local': 'local',
  'fav.empty': 'Enregistrez des lieux avec ☆ sur la fiche ou dans Réglages.',
  'fav.emptyHome':
    'Ajoutez une étoile à un lieu pour l’épingler (travail, voyages) sous le domicile.',
  'fav.emptyNoHome':
    'Ajoutez une étoile à un lieu pour l’épingler ici (domicile, travail, voyage).',
  'fav.accountHint': ' Créez un compte pour les garder sur tous vos appareils.',
  'fav.minimize': 'Réduire',
  'fav.expand': 'Agrandir',
  'fav.remove': 'Retirer',

  'settings.open': 'Ouvrir les réglages',
  'settings.title': 'Réglages',
  'settings.done': 'Terminé',
  'settings.close': 'Fermer les réglages',
  'settings.explore': 'Explorer',
  'settings.units': 'Unités',
  'settings.theme': 'Thème',
  'settings.language': 'Langue',
  'settings.density': 'Densité',
  'settings.comfortable': 'Confortable',
  'settings.compact': 'Compact',
  'settings.themeDark': '☾ Sombre',
  'settings.themeLight': '☀ Clair',
  'settings.themeAuto': 'A Auto',
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
  'settings.atmosphere': 'Ambiance météo',
  'settings.atmosphereHint': 'Pluie, neige et éclairs en arrière-plan',
  'settings.stormMode': 'Mode tempête',
  'settings.stormModeHint': 'Mise en page radar d’abord',
  'settings.alertsUi': 'Interface d’alertes',
  'settings.alertsUiHint': 'Mettre en évidence le temps violent',
  'settings.notify': 'Notifications',
  'settings.notifyHint':
    'Surveillance de pluie et alertes en arrière-plan (connexion pour la poussée serveur)',
  'settings.testNotify': 'Envoyer une notification test',
  'settings.workPin': 'Épingle travail',
  'settings.workIs': 'Ce lieu est le travail — inclus dans la surveillance de pluie',
  'settings.workReplace': 'Remplacer le travail par ce lieu',
  'settings.workSet': 'Deuxième épingle pour la navette',
  'settings.clearWork': 'Effacer le travail',
  'settings.setWork': 'Définir le travail',
  'settings.goWork': 'Aller au travail',
  'settings.analyticsOff': 'Désactiver l’analyse anonyme',
  'settings.analyticsHint': 'Ne pas envoyer l’usage de pages (aucun lieu stocké)',
  'settings.quietHours': 'Heures silencieuses',
  'settings.quietHint': 'Couper les alertes non extrêmes la nuit',
  'settings.from': 'De',
  'settings.to': 'À',
  'settings.home': 'Domicile',
  'settings.goHome': '🏠 Aller au domicile',
  'settings.setHome': '🏠 Définir ce lieu comme domicile',
  'settings.clearHome': '🏡 Effacer le domicile pour ce lieu',
  'settings.homeHint': 'Définissez le domicile depuis le panneau 🏠 ou la fiche lieu.',
  'settings.saveFav': '☆ Enregistrer ce lieu en favori',
  'settings.removeFav': '★ Retirer ce lieu des favoris',
  'settings.sync': '☁ Synchroniser le compte',
  'settings.synced': '☁ Compte synchronisé',
  'settings.share': '↗ Copier le lien de partage',
  'settings.modules': 'Afficher à l’accueil',
  'settings.modulesHint': 'Options supplémentaires',
  'settings.modulesLead': 'Gardez l’accueil calme. Activez seulement ce que vous utilisez.',

  'mod.dress': 'Tenue du jour',
  'mod.dressHint': 'Conseils vestimentaires',
  'mod.videos': 'Vidéos météo',
  'mod.videosHint': 'Sécurité / explications',
  'mod.fireMap': 'Toujours afficher la carte des feux',
  'mod.fireMapHint': 'Sinon seulement si fumée',
  'mod.chat': 'Clavardage de zone',
  'mod.chatHint': 'Communauté locale',
  'mod.shareCard': 'Carte de partage',
  'mod.shareCardHint': 'Grand bloc de partage',
  'mod.models': 'Comparaison de modèles',
  'mod.modelsHint': 'Détail multi-modèles',
  'mod.planning': 'Outils de planification',
  'mod.planningHint': 'Voyage, neige, climat',

  'auth.welcome': 'Bon retour',
  'auth.create': 'Créer un compte',
  'auth.signIn': 'Connexion',
  'auth.forgot': 'Mot de passe oublié?',
  'auth.resetSend': 'Envoyer le lien',
  'auth.resetHint':
    'Nous enverrons un lien unique si ce courriel a un compte. Expire dans 1 heure.',
  'auth.sub':
    'Synchronisez domicile, favoris, dernier lieu, unités et thème entre appareils.',
  'auth.name': 'Nom',
  'auth.email': 'Courriel',
  'auth.password': 'Mot de passe',
  'auth.wait': 'Un instant…',
  'auth.backSignIn': '← Retour à la connexion',
  'auth.fullReset': 'Page de réinitialisation',
  'auth.hashed':
    'Les comptes sont sur le serveur Solara. Les mots de passe sont hachés — jamais en clair.',
  'auth.newPassword': 'Nouveau mot de passe',
  'auth.currentPassword': 'Mot de passe actuel',
  'auth.updatePassword': 'Mettre à jour le mot de passe',
  'auth.choosePassword': 'Choisir un nouveau mot de passe',
  'auth.resetDone': 'Mot de passe mis à jour — vous pouvez vous connecter',
  'auth.signInHome': 'Se connecter à l’accueil',
  'account.changePassword': 'Changer le mot de passe',
  'account.sync': 'Synchroniser',
  'account.signOut': 'Déconnexion',
  'account.synced': '☁ Synchronisé',
  'account.note':
    'Favoris, dernier lieu, unités et thème s’enregistrent automatiquement sur votre compte.',
  'account.signingIn': 'Connexion…',
  'account.pwHelp':
    'Vous devez connaître votre mot de passe actuel. Accès perdu? Utilisez Mot de passe oublié ou le soutien.',

  'panel.hourly': 'Horaire',
  'panel.daily': 'Prévisions 14 jours',
  'panel.daily7': 'Prévisions 7 jours',
  'panel.showMore': 'Afficher 14 jours',
  'panel.showLess': 'Afficher 7 jours',
  'panel.now': 'Maintenant',
  'panel.today': 'Aujourd’hui',
  'panel.alerts': 'Alertes',
  'panel.air': 'Qualité de l’air',
  'panel.sunMoon': 'Soleil, lune et jour',
  'panel.radar': '📡 Radar',
  'panel.radarLoads': 'Le radar se charge en faisant défiler…',
  'panel.loadingRadar': 'Chargement du radar…',
  'panel.whatMatters': 'Ce qui compte maintenant',
  'panel.weekend': 'Fin de semaine',
  'panel.whatChanged': 'Ce qui a changé',

  'cond.wind': 'Vent',
  'cond.humidity': 'Humidité',
  'cond.pressure': 'Pression',
  'cond.uv': 'Indice UV',
  'cond.visibility': 'Visibilité',
  'cond.clouds': 'Couverture nuageuse',
  'cond.precip': 'Précipitations',
  'cond.feels': 'Ressenti',
  'cond.dew': 'Point de rosée {temp}',
  'cond.gusts': 'Rafales {speed}',
  'cond.msl': 'Niveau moyen de la mer',
  'cond.clear': 'Dégagé',
  'cond.moderate': 'Modéré',
  'cond.reduced': 'Réduit',
  'cond.mostlyClear': 'Plutôt dégagé',
  'cond.partlyCloudy': 'Partiellement nuageux',
  'cond.cloudy': 'Nuageux',
  'cond.falling': 'En cours',
  'cond.todayDry': 'Aujourd’hui sec',
  'cond.todayPrecip': 'Aujourd’hui {amount}',
  'cond.snow': 'Neige {amount}',
  'cond.actual': 'Réel {temp}',

  'uv.low': 'Faible',
  'uv.moderate': 'Modéré',
  'uv.high': 'Élevé',
  'uv.veryHigh': 'Très élevé',
  'uv.extreme': 'Extrême',
  'aqi.good': 'Bon',
  'aqi.moderate': 'Modéré',
  'aqi.sensitive': 'Mauvais pour les sensibles',
  'aqi.unhealthy': 'Mauvais',
  'aqi.veryUnhealthy': 'Très mauvais',
  'aqi.hazardous': 'Dangereux',

  'radar.source': 'Source',
  'radar.eccc': 'ECCC MSC GeoMet (Canada)',
  'radar.nexrad': 'NEXRAD / IEM (É.-U.)',
  'radar.ecccShort': 'ECCC MSC GeoMet',
  'radar.rainviewer': 'RainViewer / composite régional',
  'radar.fires': 'Feux FIRMS',
  'radar.warnings': 'Avertissements',

  'page.radar': 'Radar en direct',
  'page.earth': 'Terre',
  'page.chase': 'Chasseurs d’orages',
  'page.stargaze': 'Ciel étoilé',
  'page.back': '← Tableau de bord',
  'page.loadingMap': 'Chargement de la carte…',

  'fresh.offline':
    'Hors ligne — dernière prévision enregistrée. Reconnectez-vous et tirez vers le bas pour actualiser.',
  'fresh.stale': 'Prévision peut-être périmée. Tirez vers le bas pour actualiser.',
  'pro.favoritesCap': 'Le forfait gratuit permet {n} lieux. Aperçu Pro pour en ajouter.',
  'pro.badge': 'Pro',
  'pro.free': 'Gratuit',

  'coach.kicker': 'Premiers pas · {n}/{total}',
  'coach.set': 'C’est prêt',
  'coach.setHome':
    'Définissez le domicile avec 🏠 sur la fiche pour les alertes, la pluie et le widget.',
  'coach.setHomeDone':
    'Domicile enregistré. Solara le gardera prêt à l’ouverture et sur le widget.',
  'coach.modes': 'Modes sur le téléphone',
  'coach.modesBody':
    'Sous Aujourd’hui : Radar · Ciel étoilé · Terre · Tempêtes. Ou ⚙ Réglages → Explorer.',
  'coach.homeWork': 'Domicile et travail',
  'coach.homeWorkBody':
    'Optionnel : ouvrez le bureau/école et utilisez Réglages → épingle travail pour la navette.',
  'coach.homeWorkDone': 'Le travail est aussi enregistré — accédez-y via Réglages.',
  'coach.alerts': 'Alertes en arrière-plan',
  'coach.alertsOn':
    'Les notifications sont actives. Connectez-vous pour la poussée serveur quand l’app est fermée.',
  'coach.alertsOff':
    'Activez Notifications pour la pluie et les alertes — mieux avec un compte.',
  'coach.enableNotify': 'Activer les notifications',
  'coach.widget': 'Widget écran d’accueil',
  'coach.widgetBody':
    'Appui long → Ajouter un widget → Solara. Ouvrez l’app une fois pour remplir la tuile.',
  'coach.install': 'Installer Solara',
  'coach.installBody':
    'Installez sur l’écran d’accueil. Sur iPhone Safari : Partager → Sur l’écran d’accueil.',
  'coach.stargaze': 'Ciel étoilé ✨',
  'coach.stargazeBody':
    'Planifiez la nuit : score, lune, Bortle, ISS. Touchez ✨ sur la rangée de modes ou Réglages → Explorer.',
  'coach.next': 'Suivant',
  'coach.done': 'Terminé',
  'coach.skip': 'Passer',

  'wet.dryTitle': 'Vous devriez rester au sec',
  'wet.maybeTitle': 'Surtout sec, faible risque',
  'wet.wetTitle': 'Risque de vous mouiller bientôt',
  'precip.dry': 'Semble sec jusqu’à environ {until}. Laissez le parapluie.',
  'precip.dryShort': 'Sec pour les prochaines heures',
}

const catalogs: Record<LocaleId, Record<MessageKey, string>> = {
  en: { ...en },
  fr: { ...fr },
}

export function t(
  locale: LocaleId,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const raw = catalogs[locale]?.[key] ?? catalogs.en[key] ?? key
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
    window.dispatchEvent(new CustomEvent('solara-locale-change', { detail: locale }))
  } catch {
    /* ignore */
  }
}

/** Translate weather condition label/description for FR */
const WEATHER_LABEL_FR: Record<string, string> = {
  Clear: 'Dégagé',
  'Mostly Clear': 'Plutôt dégagé',
  'Partly Cloudy': 'Partiellement nuageux',
  Overcast: 'Couvert',
  Smoky: 'Fumée',
  Foggy: 'Brouillard',
  'Icy Fog': 'Brouillard givrant',
  'Light Drizzle': 'Bruine légère',
  Drizzle: 'Bruine',
  'Heavy Drizzle': 'Bruine forte',
  'Freezing Drizzle': 'Bruine verglaçante',
  'Light Rain': 'Pluie faible',
  Rain: 'Pluie',
  'Heavy Rain': 'Forte pluie',
  'Freezing Rain': 'Pluie verglaçante',
  'Light Snow': 'Neige faible',
  Snow: 'Neige',
  'Heavy Snow': 'Forte neige',
  'Snow Grains': 'Neige en grains',
  'Light Showers': 'Averses légères',
  Showers: 'Averses',
  'Heavy Showers': 'Fortes averses',
  'Snow Showers': 'Averses de neige',
  'Heavy Snow Showers': 'Fortes averses de neige',
  Thunderstorm: 'Orage',
  'Severe Storm': 'Orage violent',
  Unknown: 'Inconnu',
  'Clear sky': 'Ciel dégagé',
  'Mainly clear': 'Ciel surtout dégagé',
  'Partly cloudy': 'Partiellement nuageux',
  'Smoke in the air': 'Fumée dans l’air',
  Fog: 'Brouillard',
  'Depositing rime fog': 'Brouillard givrant',
  'Light drizzle': 'Bruine légère',
  'Moderate drizzle': 'Bruine modérée',
  'Dense drizzle': 'Bruine dense',
  'Light freezing drizzle': 'Bruine verglaçante légère',
  'Dense freezing drizzle': 'Bruine verglaçante dense',
  'Slight rain': 'Pluie faible',
  'Moderate rain': 'Pluie modérée',
  'Heavy rain': 'Forte pluie',
  'Light freezing rain': 'Pluie verglaçante légère',
  'Heavy freezing rain': 'Pluie verglaçante forte',
  'Slight snow fall': 'Neige faible',
  'Moderate snow fall': 'Neige modérée',
  'Heavy snow fall': 'Forte neige',
  'Snow grains': 'Neige en grains',
  'Slight rain showers': 'Averses de pluie légères',
  'Moderate rain showers': 'Averses de pluie',
  'Violent rain showers': 'Averses de pluie violentes',
  'Slight snow showers': 'Averses de neige légères',
  'Heavy snow showers': 'Fortes averses de neige',
  'Thunderstorm with slight hail': 'Orage avec grêle légère',
  'Thunderstorm with heavy hail': 'Orage avec forte grêle',
  'Unknown conditions': 'Conditions inconnues',
}

export function trWeatherLabel(locale: LocaleId, label: string): string {
  if (locale !== 'fr') return label
  return WEATHER_LABEL_FR[label] || label
}

export function trUv(locale: LocaleId, label: string): string {
  if (locale !== 'fr') return label
  const map: Record<string, string> = {
    Low: 'Faible',
    Moderate: 'Modéré',
    High: 'Élevé',
    'Very High': 'Très élevé',
    Extreme: 'Extrême',
  }
  return map[label] || label
}

export function trAqi(locale: LocaleId, label: string): string {
  if (locale !== 'fr') return label
  const map: Record<string, string> = {
    Good: 'Bon',
    Moderate: 'Modéré',
    'Unhealthy for Sensitive': 'Mauvais pour les sensibles',
    Unhealthy: 'Mauvais',
    'Very Unhealthy': 'Très mauvais',
    Hazardous: 'Dangereux',
  }
  return map[label] || label
}
