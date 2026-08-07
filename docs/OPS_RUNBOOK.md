# Solara ops runbook

## Live health
```
https://solaraweather.com/api/health
```
Expect `ok: true` and secrets flags (jwt / cron / vapidPrivate).  
`apns: true` only after APNs secrets are set (native closed-app push).

### Monitoring (recommended)
- Poll `GET /api/health` every **5 minutes** (UptimeRobot, Better Stack, Cloudflare, etc.).
- Alert if:
  - HTTP not 200, or `ok !== true`
  - `secrets.jwt`, `secrets.cron`, or `secrets.vapidPrivate` flip to `false`
  - Worker logs show repeated `alert-push-cron failed`
- Optional: hit `/api/sky/kp` daily; 5xx means stargaze aurora may degrade (client also tries SWPC directly).
- After each deploy: `npm run test:all` (smoke + core).

### Stargaze extras
```
GET /api/sky/kp          # geomagnetic Kp (browser may also hit SWPC directly)
GET /api/sky/iss?lat=&lon=  # ISS / Hubble / Tiangong pass approx
```
Cron (`*/10`) also sends **clear-sky night** web push when clouds look low for a saved place (once per day key).

## Worker deploy
```bash
cd weather-app
npm run deploy
# or: npm run build && npx wrangler deploy
```

## D1 migrations
```bash
npm run db:migrate:remote
```

## Codemagic archive failed
| Symptom | Fix |
|---|---|
| exit 65 / signing | Distribution cert + App Store profiles for `com.solara.weather` + `.widget` |
| profile doesn't include Push / aps-environment | Either enable **Push** on App ID **or** keep `aps-environment` **out** of `App.entitlements` (current main) |
| SPM path errors | Workflow runs `scripts/fix-ios-spm-paths.mjs` after `cap sync` |
| Wrong API host | Build must set `VITE_API_BASE=https://solaraweather.com` |

## Ship preflight (local)
```bash
npm run ship:preflight
npm run ship:ios   # preflight + reminder to start Codemagic
```

## Push
- **Web push** needs VAPID public (wrangler vars) + `VAPID_PRIVATE_KEY` secret.
- **Native APNs** needs key id/team/bundle/private key secrets — see `docs/PUSH_NOTIFICATIONS.md`.
- Test: Settings → Notify → Send test notification.

## Metrics
Privacy-light page hits: `POST /api/metrics/page` (no lat/lon).  
Summary (if enabled): `GET /api/metrics/summary`.

## Client errors
Browser may POST coarse errors to `/api/metrics/error` (path + message only).  
Check Worker logs in Cloudflare dashboard if volume spikes.
