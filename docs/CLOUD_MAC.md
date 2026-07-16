# Build Solara on a **cloud Mac** (no personal Mac)

You need **macOS + Xcode** to put Solara on the App Store. On Windows, use a **cloud Mac**.

There are two paths:

| Path | Best for | Effort | Cost (approx.) |
|------|----------|--------|----------------|
| **A. Codemagic CI** | Push code → get TestFlight build | Medium (once) | Free tier / pay per build |
| **B. Rented Mac in browser** | Click around in Xcode yourself | Low | ~$20–50/month or hourly |

---

## Path A — Codemagic (recommended)

Codemagic gives you a Mac in the cloud that builds your app when you push Git.

### 1. Prerequisites

1. **Apple Developer Program** ($99/year) → [developer.apple.com](https://developer.apple.com/programs/)
2. Create an app in **App Store Connect** (name: Solara, bundle id: `com.solara.weather`)
3. Create an **App Store Connect API key**  
   Users and Access → Integrations → App Store Connect API → Generate  
   Download the `.p8` file (once!) and note **Issuer ID** + **Key ID**
4. Push this project to **GitHub** (or GitLab / Bitbucket)

### 2. Connect Codemagic

1. Sign up: [codemagic.io](https://codemagic.io)
2. **Add application** → select your Solara repo
3. Project type: **Other** (or leave default for Capacitor)
4. Open **codemagic.yaml** in the repo (already included)

### 3. Code signing

In Codemagic → **Teams** → **Code signing identities** / **Integrations**:

- Add **App Store Connect API key** (Issuer ID, Key ID, upload `.p8`)
- Enable **automatic code signing** for bundle id `com.solara.weather`

Update `codemagic.yaml` if needed:

```yaml
integrations:
  app_store_connect: Solara   # name of YOUR integration in Codemagic UI
```

```yaml
publishing:
  email:
    recipients:
      - your-real-email@example.com
```

### 4. First build

1. Codemagic → your app → **Start new build**
2. Workflow: **`ios-simulator-check`** first (compile only, no store upload)
3. When that is green, run **`ios-app-store`** (produces IPA → TestFlight)

### 5. After a successful store build

1. Open [App Store Connect](https://appstoreconnect.apple.com) → **TestFlight**
2. Wait for processing (often 5–30 min)
3. Install TestFlight on your iPhone → accept invite → install Solara
4. When happy: submit the build for **App Review**

### Common Codemagic fixes

| Problem | Fix |
|---------|-----|
| Scheme / project not found | Confirm paths `ios/App/App.xcodeproj` and scheme `App` in Xcode on a Mac once, or open Codemagic logs |
| Signing failed | Re-create API key; ensure Bundle ID matches `com.solara.weather` |
| Capacitor out of date | Ensure `npm run build` and `npx cap sync ios` run before `xcodebuild` (yaml already does this) |
| Free minutes exhausted | Upgrade Codemagic plan or use Path B |

Official guide: [Codemagic + Capacitor](https://docs.codemagic.io/yaml-quick-start/building-a-capacitor-app/)

---

## Path B — Rent a Mac (browser desktop)

Good if you want to use **Xcode GUI** like a normal Mac.

### Providers

| Service | Notes |
|---------|--------|
| [MacinCloud](https://www.macincloud.com/) | Browser or RDP Mac |
| [MacStadium](https://www.macstadium.com/) | More “real” cloud Macs |
| [AWS EC2 Mac](https://aws.amazon.com/ec2/instance-types/mac/) | Powerful, pricier |
| [GitHub Codespaces](https://github.com/features/codespaces) | **Not** full Xcode GUI |

### Steps on a rented Mac

```bash
# 1. Install Xcode from App Store, open once, accept license
# 2. Clone your repo
git clone https://github.com/YOU/weather-app.git
cd weather-app

# 3. Node (use nvm or brew)
brew install node
npm install

# 4. Build + open Xcode
npm run build:ios
npx cap open ios
```

Then in Xcode:

1. Select **App** target → **Signing & Capabilities** → your Team  
2. Plug in iPhone **or** pick a Simulator  
3. ▶ Run  
4. For store: **Product → Archive → Distribute App → App Store Connect**

Copy the project from Windows via:

- GitHub push from PC → `git clone` on cloud Mac (best), or  
- Zip `weather-app` and upload to the cloud Mac  

---

## Path C — Hybrid (you stay on Windows)

| You do on Windows | Cloud does |
|-------------------|------------|
| Edit React / Capacitor code | Build IPA |
| `git push` | Codemagic `ios-app-store` workflow |
| Write App Store listing text | TestFlight email when done |
| Host `privacy.html` + `support.html` | — |

You never need to touch Xcode if Codemagic signing is set up correctly.

---

## Host privacy & support (required by Apple)

Before review, put these on a public HTTPS URL (GitHub Pages, Netlify, Cloudflare, etc.):

- `public/privacy.html` → e.g. `https://yourname.github.io/solara/privacy.html`
- `public/support.html` → e.g. `https://yourname.github.io/solara/support.html`

Paste those URLs into App Store Connect.

---

## Bundle ID reminder

Default in this project:

```
com.solara.weather
```

If Apple says it’s taken, change in:

1. `capacitor.config.ts` → `appId`
2. Codemagic `bundle_identifier`
3. App Store Connect new app id  
4. Re-run `npx cap sync ios`

---

## Cost reality check

| Item | Cost |
|------|------|
| Apple Developer | **$99 / year** (required) |
| Codemagic free tier | Limited Mac minutes / month |
| Codemagic paid | Pay as you go after free minutes |
| MacinCloud-style rental | Often ~$20–40 / month |
| Your Solara app binary | Free (Capacitor + this repo) |

---

## What I recommend for you (Windows)

1. Enroll in **Apple Developer**  
2. Push Solara to **GitHub**  
3. Use **Codemagic** + the included `codemagic.yaml`  
4. Ship to **TestFlight** first, then App Store  

If Codemagic feels fiddly, rent **MacinCloud** for a weekend and use Path B with Xcode.

---

## Quick commands (reference)

```bash
# On Windows (prepare only)
npm install
npm run build
npx cap sync ios
git push

# On cloud Mac or Codemagic script
npm install
npm run build:ios
npx cap open ios   # interactive Mac only
```

Full App Store checklist (icons, privacy questionnaire, review tips): see **[APP_STORE.md](./APP_STORE.md)**.
