# Sprint 1 — Trust & ops (completed checklist)

## Done in repo / Cloudflare

| Item | Status |
|------|--------|
| Auth rate limiting (login/register) | ✅ Worker `rateLimitAuth` |
| Production `JWT_SECRET` required | ✅ No more silent `atmos-dev-secret-change-me` |
| `JWT_SECRET` set on Worker | ✅ Cloudflare secret |
| `CRON_SECRET` set on Worker | ✅ Cloudflare secret |
| VAPID key **rotation** | ✅ New public key in `wrangler.toml` + private secret |
| Privacy policy / password 8+ / VAPID docs scrub | ✅ Earlier + this sprint |
| Codemagic signs main **and** widget bundle IDs | ✅ `BUNDLE_ID` + `BUNDLE_ID_WIDGET` |
| GitHub push of feature work | ✅ (after this sprint commit) |

### Manual cron after rotation

```bash
# Use the CRON_SECRET value stored in Cloudflare (Workers → atmos-weather → Settings → Secrets).
# If you lost it, rotate: openssl rand -base64 32 | wrangler secret put CRON_SECRET
curl -X POST https://solaraweather.com/api/push/run-check \
  -H "x-cron-secret: YOUR_CRON_SECRET"
```

### After VAPID rotation

Users who already subscribed to Web Push must **turn Notify off/on** (or re-subscribe) so their browser subscription is re-created against the new keys.

---

## You must finish in Apple Developer (WidgetKit)

Codemagic **cannot** create App IDs for you. Do this once at [developer.apple.com](https://developer.apple.com/account/resources/identifiers/list):

### 1. App Group

1. **Identifiers → App Groups → +**
2. Description: `Solara shared`
3. Identifier: **`group.com.solara.weather`**
4. Register

### 2. Widget extension App ID

1. **Identifiers → App IDs → +**
2. Type: **App**
3. Description: `Solara Widget`
4. Bundle ID: **Explicit** → `com.solara.weather.widget`
5. Capabilities: enable **App Groups** → select `group.com.solara.weather`
6. Register

### 3. Main app App ID

1. Open existing **`com.solara.weather`**
2. Enable **App Groups** → select **`group.com.solara.weather`**
3. Save

### 4. Push (if remote APNs)

1. On `com.solara.weather`: enable **Push Notifications**
2. Create APNs Auth Key (.p8) if not already
3. Set Worker secrets: `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_PRIVATE_KEY`, `APNS_PRODUCTION=true`

### 5. TestFlight via Codemagic

1. Push `main` (done after sprint commit)
2. Run workflow **`ios-testflight`**
3. Codemagic will fetch signing for:
   - `com.solara.weather`
   - `com.solara.weather.widget`
4. Install from TestFlight → open Solara once (loads weather for home) →  
   **Long-press Home Screen → Edit → Add Widget → Solara Weather**

If Codemagic fails on the widget profile, the App Group / widget App ID steps above were missed.

Details also in `docs/IOS_WIDGET.md`.

---

## Local verify

```bash
# Health
curl -s https://solaraweather.com/api/health

# Register should work (password ≥ 8); hammering register returns 429 after limit
curl -s -X POST https://solaraweather.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"nope@example.com\",\"password\":\"wrongpass1\"}"
```
