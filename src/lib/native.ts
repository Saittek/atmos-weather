import { Capacitor } from '@capacitor/core'

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

export function isIOS(): boolean {
  return Capacitor.getPlatform() === 'ios'
}

/** API base for auth/chat — empty string uses same-origin / Vite proxy on web */
export function getApiBase(): string {
  const fromEnv = import.meta.env.VITE_API_BASE as string | undefined
  if (fromEnv) return fromEnv.replace(/\/$/, '')

  // Capacitor bundles local files — relative /api would hit the phone, not Cloudflare
  if (isNativeApp()) return 'https://solaraweather.com'

  return ''
}

export async function initNativeShell(): Promise<void> {
  if (!isNativeApp()) return

  document.body.classList.add('native-app')
  if (isIOS()) document.body.classList.add('native-ios')

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setStyle({ style: Style.Dark })
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: '#0b1220' })
    }
  } catch {
    /* plugin unavailable */
  }

  try {
    const { SplashScreen } = await import('@capacitor/splash-screen')
    await SplashScreen.hide()
  } catch {
    /* ignore */
  }

  try {
    const { Keyboard } = await import('@capacitor/keyboard')
    await Keyboard.setAccessoryBarVisible({ isVisible: true })
  } catch {
    /* ignore */
  }
}

/** Prefer Capacitor geolocation on device for better permission UX */
export async function getCurrentPosition(): Promise<{
  latitude: number
  longitude: number
}> {
  if (isNativeApp()) {
    try {
      const { Geolocation } = await import('@capacitor/geolocation')
      const perm = await Geolocation.checkPermissions()
      if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
        const req = await Geolocation.requestPermissions()
        if (req.location !== 'granted' && req.coarseLocation !== 'granted') {
          throw new Error('Location permission denied')
        }
      }
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
      })
      return {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      }
    } catch (e) {
      if (e instanceof Error) throw e
      throw new Error('Could not get location')
    }
  }

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? 'Location permission denied'
              : 'Could not get your location',
          ),
        ),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60_000 },
    )
  })
}

export async function lightHaptic(): Promise<void> {
  if (!isNativeApp()) return
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
    await Haptics.impact({ style: ImpactStyle.Light })
  } catch {
    /* ignore */
  }
}
