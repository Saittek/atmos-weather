# Solara TestFlight checklist

**Start here for everything:** **`docs/SHIP_NOW.md`**

After merging to `main`, ship a native build so iOS matches the live website.

## Codemagic

1. Open [Codemagic](https://codemagic.io) → app **Solara** / repo **Saittek/atmos-weather**.
2. Run workflow **`ios-testflight`** on branch **`main`**.
3. Confirm build steps:
   - `npm ci` / build with `VITE_API_BASE=https://solaraweather.com`
   - `npx cap sync ios`
   - Signing for **`com.solara.weather`** + **`com.solara.weather.widget`**
   - Archive scheme **`App`** (embeds **SolaraWidgetExtension**)

## Apple Developer portal (one-time)

| Item | Value |
|------|--------|
| App ID | `com.solara.weather` |
| Widget ID | `com.solara.weather.widget` |
| App Group | `group.com.solara.weather` on **both** App IDs |
| Push | **Optional for current main** — leave OFF until you re-add `aps-environment` |
| Profiles | App Store distribution for app + widget |

## After install from TestFlight

1. Open Solara once (allows App Group snapshot write).
2. Set **Home** and enable **location**.
3. Add Home Screen widget → should show temp (not “Open Solara once…”).
4. Settings → **Notify** on → sign in if prompted.
5. Optional: **Quiet hours** to mute non-Extreme overnight.
6. Toggle **Light / Dark** — check Dashboard, Radar, Earth, Widget, Storm chaser.

## Smoke tests

- [ ] Dashboard weather loads
- [ ] Offline: airplane mode shows last weather banner
- [ ] Widget updates after pull-to-refresh / app resume
- [ ] Earth globe radar + storm tracks
- [ ] Push: server has subscription (`/api/push/subscribe` 201)
