# Atmos — Weather Command

Full-featured weather dashboard: **video-smooth HQ radar**, multi-model forecasts, air quality, severe alerts (US + Canada), fire/smoke maps, area chat, tropical storms, and PWA install.

## Run (web)

```bash
cd weather-app
npm install
npm run dev
```

This starts the **API** (`:8787` — auth, area chat, NASA FIRMS fires) and the **web app** together.  
Open **http://localhost:5173/**

## Deploy on Cloudflare Pages

The UI is a static Vite build (output: `dist/`). SPA routes are covered by `public/_redirects`.

1. Push this repo to GitHub (already set up as `Saittek/atmos-weather`).
2. In [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Select **Saittek/atmos-weather**.
4. Build settings:

| Setting | Value |
|--------|--------|
| **Framework preset** | Vite (or None) |
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |
| **Root directory** | `/` (or `weather-app` if the repo root is above the app) |

5. **Save and Deploy**.

### What works on Cloudflare (static)

Forecasts, radar, alerts (US/CA), most maps, PWA, local favorites — all call public APIs from the browser.

### What needs a hosted API (optional)

Accounts/sync, area chat, and NASA FIRMS fire hotspots use `server/` (`/api/*`).  
On static Pages alone those features degrade gracefully (or show “server offline”).

To enable them later:

1. Host `server/` somewhere with HTTPS (Railway, Fly, Render, or a Cloudflare Worker+D1 later).
2. Set a Pages env var **before build**:  
   `VITE_API_BASE=https://your-api.example.com`  
3. Redeploy.

Local prefs still save in the browser without an API.

### Highlights

- **Radar products** — precip, rain-only, snow, classic, NEXRAD, storm, satellite IR (RainViewer + NASA GIBS fallback), radar+sat
- **Fire & smoke** — NASA FIRMS hotspots + PM2.5 haze on the radar map and a dedicated fire map panel
- **Area chat** — geo-bucketed chat (~20 km) for people viewing the same area (sign-in to post)
- **Core weather** — will I get wet, next 2h precip, UV/wind, visibility, 7-day, hazards, storm mode
- **Accounts** — favorites & prefs (local + optional cloud via the API)

## iOS App Store

This project includes a **Capacitor iOS** shell (`ios/`) so you can ship Atmos on the App Store.

```bash
npm run build:ios    # build web + sync into Xcode project
# On a Mac:
npx cap open ios     # open Xcode → Archive → App Store Connect
```

**You need a Mac + Apple Developer account ($99/yr)** to compile and upload.  
No Mac? Use a **cloud Mac** — step-by-step: **[docs/CLOUD_MAC.md](docs/CLOUD_MAC.md)**  
Store checklist: **[docs/APP_STORE.md](docs/APP_STORE.md)** · CI file: `codemagic.yaml`

- Bundle ID: `com.atmos.weather` (change in `capacitor.config.ts`)
- Privacy / support pages: `public/privacy.html`, `public/support.html` (host them publicly)
- Optional cloud auth: set `VITE_API_BASE` when building (see `.env.example`)

### Routes

| Path | Purpose |
|------|---------|
| `/` | Full dashboard |
| `/radar` | Full-page live radar (`?lat=&lon=&name=`) |
| `/widget` | Compact rain widget (PWA shortcut) |

Install the PWA for home-screen shortcuts: **Live Radar**, **Rain Widget**, **Dashboard**.

### Accounts

Click **Account** in the top bar to create an account or sign in.

Saved to your account (cloud on the local server):

- Favorite locations  
- Last viewed location  
- Units, theme, density  
- Severe mode & notify prefs  

Passwords are bcrypt-hashed. User data lives in `server/data/users.json` (gitignored).  
JWT sessions last 30 days.

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
- Next ~2 hours (15-min precip when available)
- 48-hour hourly + 24h graphs (temp / pop / precip)
- 14-day outlook with expandable details
- Weekend plain-English outlook + clothing / activity tips
- Multi-model compare (Best match, GFS, ECMWF, ICON)
- Atmospheric pressure-level profile
- Air quality (US AQI + pollutants)
- NWS severe alerts (US) + optional browser notifications
- Tropical cyclone list (NHC / NWS fallback)

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
