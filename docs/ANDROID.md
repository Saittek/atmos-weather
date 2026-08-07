# Solara on Android (Capacitor)

The `android/` project is a Capacitor shell around the same web app as iOS.

## Prerequisites
- Android Studio (Ladybug or newer recommended)
- JDK 17+
- Android SDK 34+

## Build & open

```bash
cd weather-app
npm run build
npx cap sync android
npx cap open android
```

Or one-shot:

```bash
npm run android:prepare
npm run android:open
```

In Android Studio: **Run** on an emulator or device.

## Production API

For release builds, point the web bundle at production:

```bash
# Windows PowerShell
$env:VITE_API_BASE="https://solaraweather.com"
npm run build
npx cap sync android
```

## App ID
- Application ID: `com.solara.weather` (from `capacitor.config.ts`)

## Permissions
Capacitor plugins request location / notifications as used. Confirm manifests after major plugin upgrades.

## Play Store (later)
1. Create app in Google Play Console  
2. Generate signing key  
3. `cd android && ./gradlew bundleRelease`  
4. Upload AAB  

WidgetKit is **iOS-only**; Android home widgets are a separate future task.
