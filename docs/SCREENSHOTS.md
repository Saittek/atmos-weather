# App Store screenshots & marketing assets

Use these shots for App Store Connect (iPhone 6.7" / 6.5" required). Capture from Simulator or a real device after `npm run build:ios`.

## Recommended set (6–8 frames)

| # | Screen | Caption idea |
|---|--------|----------------|
| 1 | Dashboard hero + **next-hour** precip strip | **Know if you’ll get wet** |
| 2 | Next 2 hours + hourly | **The next few hours, clearly** |
| 3 | 7-day strip | **Your week at a glance** |
| 4 | Live radar (open) | **Radar when it matters** |
| 5 | **3D Earth** + hurricane track + radar | **Storms on a real globe** |
| 6 | Storm Chasers + chase pack share | **Chase desk in your pocket** |
| 7 | Alerts / What matters now | **Severity, timing, action** |
| 8 | Rain widget `/widget` | **One-tap rain check on your home screen** |
| 9 | Favorites / home pin | **All your places, rain-watched** |
| 10 | Settings (theme + plan Free) | **Units, theme, cloud sync** |

See also **`APP_STORE_LISTING.md`** for subtitle, description, and review notes.

## How to capture (Simulator)

1. `npm run build:ios` then open Xcode and run **iPhone 15 Pro Max** (or 16 Pro Max).
2. File → New Screen Recording *or* `Cmd+S` for screenshot.
3. Prefer **dark mode** as primary (matches Solara branding); add 1–2 light-mode frames.
4. Export **PNG**, no status-bar clutter if possible (Simulator → Features → Status bar).

## Onboarding (already in app)

First launch shows a 3-step tour (`solara-onboarding-v1` in localStorage).  
To re-test: clear site data or run in the browser console:

```js
localStorage.removeItem('solara-onboarding-v1')
```

## Home screen “widget”

Until native WidgetKit / Live Activities ship:

- PWA / home-screen shortcut → **https://solaraweather.com/widget**
- iOS: Safari → Share → **Add to Home Screen**
- Android: browser install / add to home screen
- App Store listing can mention “Rain Widget shortcut” and plan “Live Activities” in What’s New later

## Privacy / support URLs (required)

- Privacy: https://solaraweather.com/privacy.html  
- Support: https://solaraweather.com/support.html  
