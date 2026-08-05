# Solara ops runbook

## Live health
```
https://solaraweather.com/api/health
```
Expect `ok: true` and secrets flags (jwt / cron / vapidPrivate).  
`apns: true` only after APNs secrets are set (native closed-app push).

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
