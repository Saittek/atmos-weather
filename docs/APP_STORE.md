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
| Hosted API | Deploy `server/` to Railway, Fly.io, Render, etc. |
| `VITE_API_BASE` | e.g. `https://solara-api.yourdomain.com` when building |

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
# .env.production
VITE_API_BASE=https://your-api.example.com
```

```bash
npm run build:ios
```

Deploy the Node server (`server/index.js`) with HTTPS and set `JWT_SECRET` in the host env.

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
   - Optional: **Push Notifications** if you add APNs later

6. Run on a Simulator or device (cable + “Trust”).

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

### Review tips (avoid rejection)

Apple sometimes rejects “thin” WebView wrappers (**Guideline 4.2**). You already have:

- Native geolocation plugin  
- Status bar / splash  
- Offline-capable shell  
- Real weather utility  

Still help your case:

- Use a unique app name/icon/screenshots  
- Don’t market it as “just a website”  
- Keep location purpose string accurate  
- Test radar + alerts offline network failure UX  

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

## Android later

```bash
npm install @capacitor/android
npx cap add android
npm run build && npx cap sync android
npx cap open android
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
