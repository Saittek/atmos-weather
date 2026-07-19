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
4. Star places (favorites) and/or set last location.
5. Every **10 minutes** the Worker checks NWS + ECCC for those places and pushes **Severe/Extreme** alerts (Moderate+ if severe mode is off).

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

## iOS App Store (later)

1. `npx cap sync ios`
2. Enable Push Notifications capability in Xcode
3. Upload APNs key to a push provider (or implement APNs HTTP/2 send in Worker)
4. Device tokens already POST to `/api/push/device`

## Privacy

Only users who opt in (`notifyAlerts`) and have push subscriptions receive messages.
Alert IDs are stored in `push_sent` to avoid spam (30-day prune).
