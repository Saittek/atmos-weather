# Solara native iOS Home Screen widget (WidgetKit)

This is a **real** iOS widget: long-press Home Screen → **Edit** → **Add Widget** → **Solara Weather**.

It is **not** the web `/widget` page or “Add to Home Screen” PWA icon.

## What shipped in the repo

| Piece | Path / ID |
|--------|-----------|
| Widget extension target | `ios/App/SolaraWidget/` → product `SolaraWidgetExtension.appex` |
| Bundle ID (widget) | `com.solara.weather.widget` |
| Bundle ID (app) | `com.solara.weather` |
| App Group | `group.com.solara.weather` |
| Capacitor bridge | `ios/App/App/SolaraWidgetPlugin.swift` → JS name `SolaraWidget` |
| JS publisher | `src/lib/nativeWidget.ts` (called from `useWeather` after forecast load) |
| Widget kind | `SolaraHomeWidget` |
| Sizes | Small + Medium + Large |
| Medium/Large | Today: H/L, rain %, UV, wind, humidity, sun times, day tip |
| Deep link | `solara://home` |

### Data flow

1. User opens Solara (native app) and loads weather for **home** (or last place if no home).
2. React builds a JSON snapshot and calls `SolaraWidget.setSnapshot`.
3. Plugin writes JSON to App Group `UserDefaults` and reloads WidgetKit timelines.
4. Extension reads the snapshot and paints SwiftUI.
5. If the snapshot is older than ~45 minutes, the extension re-fetches **Open-Meteo** itself using stored lat/lon.

## Apple Developer setup (one-time)

**Required before Codemagic TestFlight includes the widget.** Full checklist: `docs/SPRINT1.md`.

1. [developer.apple.com](https://developer.apple.com) → **Identifiers**
2. Create **App Group** `group.com.solara.weather`
3. Create App ID **`com.solara.weather.widget`** (App Extension) with App Groups enabled
4. On main App ID **`com.solara.weather`**: enable App Groups → same group
5. Codemagic `ios-testflight` fetches signing for both `BUNDLE_ID` and `BUNDLE_ID_WIDGET`

## Xcode (Mac) checklist

1. Open `ios/App/App.xcodeproj`
2. Confirm targets: **App** + **SolaraWidgetExtension**
3. App target → Signing & Capabilities → **App Groups** → `group.com.solara.weather`
4. SolaraWidgetExtension → same App Group
5. Team selected on both targets
6. Run **App** on a physical iPhone/iPad (widgets are flaky in Simulator)
7. Open Solara once so weather publishes a snapshot
8. Home Screen → Edit → Add Widget → **Solara Weather**

## Codemagic

`codemagic.yaml` now also fetches signing files for `BUNDLE_ID_WIDGET` (`com.solara.weather.widget`).

If the IPA build fails on the extension:

- Confirm the widget App ID exists with App Groups
- Confirm profiles include the App Group entitlement
- In Xcode, Product → Archive once locally to validate embedding

## User instructions (in-app / support)

1. Install Solara from TestFlight / App Store  
2. Open the app and set **Home** (or load your city)  
3. Long-press the Home Screen → **Edit** → **Add Widget**  
4. Search **Solara** → add Small or Medium  
5. Tap the widget anytime to open Solara  

## Limits (iOS)

- Widget refresh is **budgeted by iOS** (often ~15–60+ minutes when idle)
- Not a live radar map
- Location for the tile comes from the app’s home/last place, not continuous GPS inside the extension
- Web / PWA builds do not show this widget — only the native iOS binary

## Local dev (Mac)

```bash
npm run build:ios
npx cap open ios
# Run App scheme on device, then add widget from Home Screen
```
