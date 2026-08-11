# Ship Solara on the iOS App Store

Solara is a **Capacitor** iOS app: your React weather UI runs in a native shell with real location permissions, splash screen, and status bar — ready to archive in Xcode and upload to App Store Connect.

> **You are on Windows.** Building and uploading an iOS app **requires a Mac** (or a cloud Mac CI service). The project is prepared here; final compile happens on macOS.

---

## What you need

| Requirement | Notes |
|-------------|--------|
| **Mac** with macOS Sequoia/Sonoma (or similar) | Xcode only runs on Mac |
| **Xcode** (latest stable from Mac App Store) | Includes iOS SDK + Simulator |
| **Apple Developer Program** | [developer.apple.com](https://developer.apple.com) — **$99 USD/year** |
| **Bundle ID** | Default: `com.solara.weather` (change if taken) |
| **Privacy Policy URL** | Host `public/privacy.html` (required by Apple) |
| **Support URL** | Host `public/support.html` |
| **Icons** | 1024×1024 App Store icon + Xcode asset catalog |

Optional for **accounts/sync** on device:

| Requirement | Notes |
|-------------|--------|
| Hosted API | Cloudflare Worker + D1 (`npm run deploy` / `wrangler deploy`) |
| `VITE_API_BASE` | `https://solaraweather.com` when building for device/cloud auth |

Without a hosted API, **favorites and prefs still work on-device** (local storage). Sign-in just won’t sync to a server.

---

## One-time setup (this repo — Windows OK)

```bash
cd weather-app
npm install
npm run build
npx cap add ios          # creates ios/ project (if not already)
npx cap sync ios
```

On **Windows**, `cap add ios` usually works; you still open the project on a Mac later.

### Change app ID / name

Edit `capacitor.config.ts`:

```ts
appId: 'com.yourname.solara',  // must be unique
appName: 'Solara',
```

Then re-run `npx cap sync ios`.

### Production API (optional)

```bash
# .env.production  (or export before build)
VITE_API_BASE=https://solaraweather.com
```

```bash
npm run build:ios
```

Auth/API already runs on Cloudflare at **https://solaraweather.com/api** (same Worker as the site).

---

## On your Mac

1. Copy or clone this project onto the Mac.
2. Install **Xcode** + open once to accept license.
3. Install CocoaPods if prompted: `sudo gem install cocoapods`
4. From project folder:

```bash
npm install
npm run build:ios
npx cap open ios
```

5. In Xcode:
   - Select the **Solara** target
   - **Signing & Capabilities** → your Team
   - Bundle Identifier = `com.solara.weather` (or yours)
   - Add **Location When In Use** (Capacitor Geolocation usually injects this)
   - **Push Notifications** capability (required for closed-app alerts)
   - Background Modes → Remote notifications (optional but recommended)

6. Run on a Simulator or device (cable + “Trust”).

### APNs (remote push when app is closed)

Solara already registers device tokens to `/api/push/device` and the Worker can send APNs when secrets are set:

```bash
# From weather-app/ on a machine with wrangler auth
npx wrangler secret put APNS_KEY_ID
npx wrangler secret put APNS_TEAM_ID
npx wrangler secret put APNS_BUNDLE_ID      # e.g. com.solara.weather
npx wrangler secret put APNS_PRIVATE_KEY    # full .p8 PEM
npx wrangler secret put APNS_PRODUCTION     # true for TestFlight / App Store
```

Until secrets are set, users still get **in-app / local** alerts (threat proximity, morning home brief, rain watch).

See also `docs/PUSH_NOTIFICATIONS.md`.

### Info.plist permission strings (verify)

Xcode → Info (or `ios/App/App/Info.plist`):

- `NSLocationWhenInUseUsageDescription`  
  e.g. *“Solara uses your location to show local weather, radar, and alerts.”*
- `NSLocationAlwaysAndWhenInUseUsageDescription` (only if you request always — we don’t by default)

---

## App Store Connect checklist

1. Create app at [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
2. Fill:
   - Name, subtitle, category (**Weather**)
   - Privacy Policy URL (hosted `privacy.html`)
   - Support URL (hosted `support.html`)
   - Screenshots (6.7", 6.5", 5.5" as required)
   - 1024×1024 icon
3. **App Privacy** questionnaire:
   - Location (precise/coarse) — App Functionality
   - Contact info if accounts — if you offer sign-in
4. Archive in Xcode: **Product → Archive → Distribute App → App Store Connect**
5. Submit for review

### Screenshot ideas (home-centric)

1. Dashboard with **exact home** + current conditions  
2. Radar with **🏠 home pin** + severe warning polygons  
3. Storm Chasers desk (CAPE / threat bar)  
4. Rain widget (`/widget`) locked to home  
5. Native Home Screen widget (WidgetKit) — see **docs/IOS_WIDGET.md**  
5. Morning / severe notification mock (or in-app banner)

### Review tips (avoid rejection)

Apple sometimes rejects “thin” WebView wrappers (**Guideline 4.2**). You already have:

- Native geolocation plugin  
- Status bar / splash  
- Offline-capable shell  
- Real weather utility  
- Exact home pin, radar, severe products  

Still help your case:

- Use a unique app name/icon/screenshots  
- Don’t market it as “just a website”  
- Keep location purpose string accurate  
- Test radar + alerts offline network failure UX  
- Mention **home alerts** and **radar** in the review notes 

---

## Scripts reference

| Command | Purpose |
|---------|---------|
| `npm run build` | Web production build → `dist/` |
| `npm run build:ios` | Build web + `cap sync ios` |
| `npm run ios:open` | Open Xcode project (Mac) |
| `npm run ios:sync` | Copy web assets into iOS project |

---

## Cloud Mac options (no personal Mac)

**Full guide:** **[CLOUD_MAC.md](./CLOUD_MAC.md)**

| Option | Use when |
|--------|----------|
| **[Codemagic](https://codemagic.io/)** + `codemagic.yaml` in repo | Best on Windows — push Git → TestFlight |
| **[MacinCloud](https://www.macincloud.com/)** / **[MacStadium](https://www.macstadium.com/)** | You want full Xcode in a browser |
| GitHub Actions macOS | Advanced DIY CI |

Flow (Codemagic): push repo → cloud Mac runs `npm run build` + `cap sync` + `xcodebuild` → TestFlight.

---

## Android

Capacitor Android project is already in `android/`. See **`docs/ANDROID.md`**.

```bash
npm run android:prepare
npm run android:open
```

---

## Honest summary

| Step | Can do on Windows? |
|------|--------------------|
| Code + Capacitor config | ✅ Done in this project |
| `npm run build` / `cap sync` | ✅ |
| Compile `.ipa` / Simulator | ❌ Needs Mac |
| App Store upload | ❌ Needs Mac + paid developer account |
| Hosting API + privacy URLs | ✅ Any host |

Once you have a Mac + Apple Developer membership, you’re a `build:ios` + Xcode Archive away from TestFlight.
