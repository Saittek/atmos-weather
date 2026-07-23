# Solara push notifications

## What works

| Channel | When | How |
|---------|------|-----|
| **In-app / tab open** | Always (Notify on) | Browser `Notification` + rain watch |
| **Web Push (background)** | Signed-in + Notify on | Service worker + Cloudflare cron |
| **Native local** | Capacitor iOS/Android | `@capacitor/local-notifications` |
| **Native remote (APNs/FCM)** | After Apple/Firebase setup | Tokens stored in `device_tokens` |

## User flow

1. **Sign in** (needed for server-side push).
2. Turn on **Notify** in settings.
3. Allow browser/system notification permission.
4. Set an **exact home** (GPS or coordinates) — highest priority for alerts.
5. Star places (favorites) and/or use last location as extras.
6. Every **10 minutes** the Worker checks NWS + ECCC for home + places and pushes **Severe/Extreme** alerts (Moderate+ if severe mode is off).

### In-app / local extras (no APNs required)

| Alert | When |
|-------|------|
| **Threat near you** | TOR/SVR/FF polygon near current place |
| **Home escalation** | Watch near home upgrades to a warning |
| **Morning brief** | Once per local day ~6–10am for home (when Notify or Alerts UI is on) |
| **Rain watch** | Favorites / home precip timing |

## Server secrets

```bash
# Already generated once — set private key as a secret (do not commit):
npx wrangler secret put VAPID_PRIVATE_KEY
# paste: Ld3IIJ3U3g4wvNkds7bszzP6GYY6kiEnxRM6qc3SHpI

# Optional: protect manual cron HTTP trigger
npx wrangler secret put CRON_SECRET
```

Public key is in `wrangler.toml` `[vars]` and `.env.production` as `VITE_VAPID_PUBLIC_KEY`.

## Migrations

```bash
npx wrangler d1 migrations apply atmos-db --remote
```

## Manual test

```bash
# After deploy + sign-in + notify on:
curl -X POST https://solaraweather.com/api/push/run-check \
  -H "Authorization: Bearer YOUR_JWT"
# or with CRON_SECRET:
curl -X POST https://solaraweather.com/api/push/run-check \
  -H "x-cron-secret: YOUR_SECRET"
```

## iOS APNs (remote when app closed)

Device tokens already POST to `/api/push/device` when the user enables Notify on a signed-in native build.

Worker send path is implemented (`worker/apns.js`) and runs from the 10‑minute alert cron **when these secrets exist**:

```bash
npx wrangler secret put APNS_KEY_ID        # e.g. AB12CD34EF
npx wrangler secret put APNS_TEAM_ID       # Apple Team ID
npx wrangler secret put APNS_BUNDLE_ID     # e.g. com.yourco.solara
npx wrangler secret put APNS_PRIVATE_KEY   # full .p8 PEM including BEGIN/END lines
# Production App Store / TestFlight builds:
npx wrangler secret put APNS_PRODUCTION    # true
```

Also in Xcode / Apple Developer:

1. `npx cap sync ios`
2. Enable **Push Notifications** capability
3. Create an **APNs Auth Key** (.p8) and note Key ID + Team ID
4. Use the same bundle id as `APNS_BUNDLE_ID`

Until secrets are set, native still gets **local notifications** for in-app threat proximity (TOR/SVR polygons near you).

## Privacy

Only users who opt in (`notifyAlerts`) and have push subscriptions receive messages.
Alert IDs are stored in `push_sent` to avoid spam (30-day prune).
