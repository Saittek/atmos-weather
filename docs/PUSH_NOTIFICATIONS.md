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
# Generate a VAPID key pair offline, then store ONLY the private key as a Worker secret.
# NEVER commit the private key to git or paste it into docs.
npx wrangler secret put VAPID_PRIVATE_KEY
# (paste private key at the prompt — value stays only in Cloudflare)

# Strongly recommended: protect manual cron HTTP trigger
npx wrangler secret put CRON_SECRET

# Ensure JWT is not the default dev secret in production
npx wrangler secret put JWT_SECRET
```

Public VAPID key is safe to expose (`wrangler.toml` `[vars]` and/or `VITE_VAPID_PUBLIC_KEY`).

If a private VAPID key was ever committed or shared, **rotate it**: generate a new pair, update `VAPID_PUBLIC_KEY` + secret, redeploy, and have users re-enable Notify.

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
npx wrangler secret put APNS_TEAM_ID       # Apple Team ID (10 chars)
npx wrangler secret put APNS_BUNDLE_ID     # com.solara.weather
npx wrangler secret put APNS_PRIVATE_KEY   # full .p8 PEM including BEGIN/END lines
# Production App Store / TestFlight builds:
npx wrangler secret put APNS_PRODUCTION    # true
```

Verify: `curl -s https://solaraweather.com/api/health` → `secrets.apns: true` after deploy.

Also in Xcode / Apple Developer:

1. `npx cap sync ios`
2. Enable **Push Notifications** on App ID `com.solara.weather` (Identifiers → App IDs)
3. Create an **APNs Auth Key** (.p8) and note Key ID + Team ID
4. Use the same bundle id as `APNS_BUNDLE_ID`
5. `ios/App/App/App.entitlements` includes `aps-environment=production` again for closed-app APNs.
6. Codemagic App Store profile must include **Push Notifications** — enable it on App ID `com.solara.weather` first, or archive fails with “profile doesn't include aps-environment”.
7. In the web app: **Settings → Notify** + **Send test notification**. Sign in so `/api/push/subscribe` stores the subscription for delivery when the tab is closed.

Until secrets + App ID Push capability are set, native still gets **local notifications** for in-app threat proximity. Web push works when signed in + Notify on.

## Privacy

Only users who opt in (`notifyAlerts`) and have push subscriptions receive messages.
Alert IDs are stored in `push_sent` to avoid spam (30-day prune).
