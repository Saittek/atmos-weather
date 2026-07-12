import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Atmos iOS / native shell config.
 * App Store bundle ID — change before shipping if you own a different domain/org.
 */
const config: CapacitorConfig = {
  appId: 'com.atmos.weather',
  appName: 'Atmos',
  webDir: 'dist',
  server: {
    // Production: app loads from bundled dist/
    // For live reload on device (Mac only):
    // androidScheme: 'https',
    // url: 'http://YOUR_LAN_IP:5173',
    androidScheme: 'https',
    iosScheme: 'https',
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#0b1220',
      showSpinner: false,
      androidSplashResourceName: 'splash',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0b1220',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    Geolocation: {
      // iOS permission strings are also set in Info.plist via config below
    },
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    backgroundColor: '#0b1220',
    scheme: 'Atmos',
  },
}

export default config
