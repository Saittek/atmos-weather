# Solara — Weather Command

**Live site:** [https://solaraweather.com](https://solaraweather.com)

Full-featured weather dashboard: **video-smooth HQ radar**, multi-model forecasts, air quality, severe alerts (US + Canada), fire/smoke maps, area chat, tropical storms, and PWA install.

## Run (web)

```bash
cd weather-app
npm install
npm run dev
```

This starts the **API** (`:8787` — auth, area chat, NASA FIRMS fires) and the **web app** together.  
Open **http://localhost:5173/**

## Deploy on Cloudflare (SPA + accounts API)

Solara ships as **one Worker**: static Vite assets (`dist/`) plus a Worker that handles  
**`/api/*`** (auth, prefs sync, area chat, NASA FIRMS fires) on **D1**.

SPA routes (`/radar`, `/widget`) use **`wrangler.toml`** →  
`[assets] not_found_handling = "single-page-application"`.

> **Do not** use `/* /index.html 200` in `_redirects` — Cloudflare returns  
> error **100324** (infinite loop) when HTML extension stripping is enabled.

### Deploy with Wrangler (recommended)

```bash
npm install
npm run build
# First time only — apply D1 schema + set JWT secret:
npx wrangler d1 migrations apply atmos-db --remote
# Interactive secret (pick a long random string):
npx wrangler secret put JWT_SECRET
npx wrangler deploy
```

Or one-shot after secrets/migrations are set: `npm run deploy`.

**Production:** [https://solaraweather.com](https://solaraweather.com) (Cloudflare Worker + custom domain).  
Also available on the Worker URL if configured.  
The frontend calls **same-origin** `/api/*` — no `VITE_API_BASE` needed for web.

### Git / CI deploy

Connect the repo so pushes run `npm run build` then `wrangler deploy` (Workers Builds  
or your CI). Ensure `JWT_SECRET` is set as a Worker secret and D1 migrations are applied.

### What works online

| Feature | How |
|--------|-----|
| Forecasts, radar, alerts, maps | Browser → public APIs |
| Accounts / login / prefs sync | Worker `/api/auth/*`, `/api/user/*` → D1 |
| Area chat | Worker `/api/chat/*` → D1 |
| Fire hotspots | Worker `/api/fires` → NASA FIRMS (cached) |

**Local dev** still uses Express (`npm run dev` → API on `:8787` + Vite proxy).  
Production uses the Worker + D1. New accounts on Cloudflare are separate from  
local `server/data/users.json`.

### Highlights

- **Radar products** — precip, rain-only, snow, classic, NEXRAD, storm, satellite IR (RainViewer + NASA GIBS fallback), radar+sat
- **Fire & smoke** — NASA FIRMS hotspots + PM2.5 haze on the radar map and a dedicated fire map panel
- **Area chat** — geo-bucketed chat (~20 km) for people viewing the same area (sign-in to post)
- **Core weather** — will I get wet, next 2h precip, UV/wind, visibility, 7-day, hazards, storm mode
- **Accounts** — favorites & prefs (local + optional cloud via the API)

## iOS App Store

This project includes a **Capacitor iOS** shell (`ios/`) so you can ship Solara on the App Store.

### Android
Capacitor Android project lives in `android/`. See **[docs/ANDROID.md](docs/ANDROID.md)**.

```bash
npm run android:prepare
npm run android:open
```

```bash
npm run build:ios    # build web + sync into Xcode project
# On a Mac:
npx cap open ios     # open Xcode → Archive → App Store Connect
```

**You need a Mac + Apple Developer account ($99/yr)** to compile and upload.  
No Mac? Use a **cloud Mac** — step-by-step: **[docs/CLOUD_MAC.md](docs/CLOUD_MAC.md)**  
Store checklist: **[docs/APP_STORE.md](docs/APP_STORE.md)** · CI file: `codemagic.yaml`

- Bundle ID: `com.solara.weather` (change in `capacitor.config.ts`)
- Privacy / support pages: `public/privacy.html`, `public/support.html` (host them publicly)
- Optional cloud auth: set `VITE_API_BASE` when building (see `.env.example`)

### Routes

| Path | Purpose |
|------|---------|
| `/` | Full dashboard |
| `/radar` | Full-page live radar (`?lat=&lon=&name=`) |
| `/globe` · `/earth` | 3D Earth global radar + tropical tracks |
| `/chase` | Storm Chasers desk |
| `/stargaze` | Night sky / astrophotography planner |
| `/widget` | Compact rain widget (PWA shortcut) |

**Phone / iOS:** top-bar mode chips are hidden under 720px. Use the **modes row** under Today at a glance, or **Settings → Explore** (Radar, Stargaze, Earth, Chase).

Install the PWA for home-screen shortcuts: **Live Radar**, **Storm Chasers**, **Dashboard**.

### Accounts

Click **Account** in the top bar to create an account or sign in.

Saved to your account (cloud on the local server):

- Favorite locations  
- Last viewed location  
- Units, theme, density  
- Severe mode & notify prefs  

**Local:** passwords bcrypt-hashed; data in `server/data/users.json` (gitignored).  
**Production (Cloudflare):** PBKDF2-hashed passwords + JWT in D1 (`atmos-db`).  
JWT sessions last 30 days. Signed-in users can **Change password** from Account menu (no email reset yet).

## Features

### Radar & maps
- Video-style radar loop (preloaded frames + crossfade)
- 512px RainViewer tiles, NEXRAD / multiple color schemes
- Satellite IR (when available), coverage mask, basemaps
- Overlays: temperature · wind · cloud cover · model precip grid
- Fullscreen, timeline scrub, speed control
- Severe mode highlights radar when alerts fire

### Forecasts & data
- Current conditions + adaptive sky gradients
- **Precip timing sentence** (15-min + hourly: when it starts, how much)
- Clear source line (ECCC City Page blend in Canada, multi-model elsewhere)
- 48-hour hourly + 24h graphs (temp / pop / precip)
- 14-day outlook with expandable details
- Weekend plain-English outlook + clothing / activity tips
- Multi-model compare (Best match, GFS, ECMWF, ICON)
- Atmospheric pressure-level profile
- Air quality (US AQI + pollutants)
- NWS severe alerts (US) + Environment Canada alerts
- Tropical cyclone list (NHC / NWS fallback)
- **Stargaze** — night score, moon, Bortle, clear-sky chart, ISS

### App UX
- Search any city + geolocation
- **Favorites** (up to 12, localStorage)
- **Share links** `?lat=&lon=&name=`
- °F/°C, dark / light / auto theme, compact density
- PWA (installable, offline shell)

## Data sources (no API keys)

| Data | Source |
|------|--------|
| Forecast / models / pressure | [Open-Meteo](https://open-meteo.com/) |
| Radar / satellite | [RainViewer](https://www.rainviewer.com/) |
| Geocoding | Open-Meteo + Nominatim |
| US alerts | [NWS](https://www.weather.gov/) |
| Tropical | NHC / NWS |

Personal / non-commercial use. Respect provider terms.

## Scripts

```bash
npm run dev
npm run build
npm run preview
```
