# Ship Solara now — master checklist

**You** finish Apple portal + click Codemagic (sections A–B).  
**Repo** is archive-ready: Push entitlement **off**, App Groups on, widget embedded.

**After TestFlight install:** run **`docs/DEVICE_QA.md`**.  
**Ops / outages:** **`docs/OPS_RUNBOOK.md`**.

```bash
# From weather-app/
npm run ship:preflight   # local checks + live /api/health
npm run ship:ios         # same + Codemagic reminder
```

---

## A. Apple Developer (you · ~15 min)

Open [developer.apple.com/account/resources/identifiers](https://developer.apple.com/account/resources/identifiers/list)

### 1. App Group
- **Identifiers → App Groups → +**
- ID: `group.com.solara.weather`
- Register

### 2. Main App ID `com.solara.weather`
- Capabilities:
  - **App Groups** → enable → select `group.com.solara.weather`
  - **Push Notifications** → enable *(required only when `aps-environment` is in App.entitlements)*
- Save  
- **Current main branch:** Push entitlement is **off** so Codemagic can archive without Push on the App ID. Web push still works. Re-enable per `docs/PUSH_NOTIFICATIONS.md` when ready for native APNs.

### 3. Widget App ID `com.solara.weather.widget`
- Type: App (explicit)
- Capabilities: **App Groups** → `group.com.solara.weather`
- Save

### 4. App Store Connect
- [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **My Apps → +**
- Name: **Solara**
- Bundle ID: **com.solara.weather**
- SKU: `solara-weather` (or similar)

### 5. (Optional) APNs Auth Key for closed-app iOS push
- Certificates, Identifiers & Profiles → **Keys → +**
- Enable **Apple Push Notifications service (APNs)**
- Download `.p8` once; note **Key ID** + **Team ID**
- Put on Cloudflare (see section C)

If Codemagic archive fails with *profile doesn't include Push / aps-environment*, step **2 Push** was missed, or profiles are stale (Codemagic recreates them each run).

---

## B. Codemagic TestFlight (you · click once)

1. [codemagic.io](https://codemagic.io) → app linked to **Saittek/atmos-weather**
2. Integration **Solara** = App Store Connect API key
3. **Start new build** → workflow **`ios-testflight`** → branch **`main`**
4. Or enable webhook so every push to `main` builds
5. Wait for green → App Store Connect → **TestFlight** → install on iPhone

### After install (smoke)
- [ ] Open app once (widget snapshot + location)
- [ ] Set **Home** (and optional **Work**)
- [ ] Home Screen → Add Widget → **Solara Weather**
- [ ] Pull-to-refresh from top
- [ ] Radar + Earth open
- [ ] Settings → **Notify** → **Send test notification**
- [ ] Sign in → cloud favorites sync

---

## C. Cloudflare secrets (push)

### Web Push (already used if VAPID is set)
```bash
# Public key also in wrangler.toml vars
npx wrangler secret put VAPID_PRIVATE_KEY
```

### iOS APNs (native closed-app alerts)
```bash
npx wrangler secret put APNS_KEY_ID        # from Apple Keys
npx wrangler secret put APNS_TEAM_ID       # 10-char Team ID
npx wrangler secret put APNS_BUNDLE_ID     # com.solara.weather
npx wrangler secret put APNS_PRIVATE_KEY   # full .p8 including BEGIN/END
npx wrangler secret put APNS_PRODUCTION    # true  (TestFlight + App Store)
```

Also ensure production secrets exist:
```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put CRON_SECRET
```

Health: `https://solaraweather.com/api/health`  
Should show secrets present (jwt / cron / vapidPrivate) without leaking values.

---

## D. App Store listing (copy-paste)

Use **`docs/APP_STORE_LISTING.md`** for:
- Subtitle, description, keywords  
- Privacy / Support URLs  
- Screenshot plan (`docs/SCREENSHOTS.md`)  
- Review notes  

URLs (live):
- Privacy: https://solaraweather.com/privacy.html  
- Support: https://solaraweather.com/support.html  
- Marketing: https://solaraweather.com/

---

## E. Repo commands (dev machine)

```bash
# Preflight (entitlements, SPM script, health)
npm run ship:preflight

# Web deploy
npm run deploy

# iOS local prepare (still need Mac/Codemagic to archive)
npm run ios:prepare
```

After Apple portal steps: just push `main` or start Codemagic.

---

## F. What is already done in the repo

| Area | Status |
|------|--------|
| Capacitor iOS `com.solara.weather` | ✅ |
| Widget extension + App Group entitlements | ✅ |
| `aps-environment` + `UIBackgroundModes` remote-notification | ✅ |
| Codemagic `ios-testflight` (SPM fix, dual profiles, raw archive logs) | ✅ |
| Web push subscribe + test notification UI | ✅ |
| Worker APNs send path (`worker/apns.js`) | ✅ when secrets set |
| Privacy / support pages | ✅ |
| Listing draft | ✅ `APP_STORE_LISTING.md` |

---

## G. If something fails

| Symptom | Fix |
|---------|-----|
| Codemagic exit 65 · aps-environment | Enable **Push** on App ID, re-run build |
| Codemagic · widget profile | Create widget App ID + App Group |
| Widget “Open Solara once” | Open app with network once |
| Test notification only local | Sign in + VAPID/APNs secrets |
| High temp &lt; current (Canada) | Fixed on main (ECCC day index) — rebuild IPA |

---

**Your only hard blockers:** Apple portal (section A) + click Codemagic (section B). Everything else is ready.
