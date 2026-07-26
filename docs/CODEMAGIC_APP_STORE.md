# Put Solara on the Apple App Store with Codemagic

You are on **Windows** — Codemagic is the cloud Mac that builds and uploads the app. You do **not** need your own Mac for the compile.

---

## What you need

| Item | Why |
|------|-----|
| **Apple Developer Program** ($99/year) | Required to ship any iOS app |
| **GitHub repo** with this project | Codemagic builds from git |
| **Codemagic account** | [codemagic.io](https://codemagic.io) (free tier works to start) |
| **App Store Connect API key** | Lets Codemagic sign + upload for you |
| **App record** in App Store Connect | Bundle ID `com.solara.weather` |

Privacy & support pages (already in this repo):

- https://solaraweather.com/privacy.html  
- https://solaraweather.com/support.html  

---

## Step 1 — Apple Developer

1. Enroll: https://developer.apple.com/programs/  
2. Wait until membership is **Active**.

---

## Step 2 — Create the app in App Store Connect

1. Open https://appstoreconnect.apple.com  
2. **My Apps** → **+** → **New App**  
3. Platform: **iOS**  
4. Name: **Solara**  
5. Bundle ID: register **com.solara.weather** if needed (Certificates, IDs & Profiles → Identifiers)  
6. SKU: e.g. `solara-weather-1`  
7. Create the app (you can finish screenshots later).

---

## Step 3 — App Store Connect API key (for Codemagic)

1. App Store Connect → **Users and Access** → **Integrations** → **App Store Connect API**  
2. **Generate API Key**  
   - Name: `Codemagic Solara`  
   - Access: **App Manager**  
3. **Download** the `.p8` file **once** (you cannot download it again)  
4. Note **Issuer ID** and **Key ID**

---

## Step 4 — Connect Codemagic

1. Sign up / log in at https://codemagic.io  
2. **Teams** → **Team integrations** → **Developer Portal** → **Connect** / **Manage keys**  
3. Add the API key:  
   - **App Store Connect API key name:** `Solara`  
     *(must match `integrations.app_store_connect: Solara` in `codemagic.yaml`)*  
   - Paste **Issuer ID**, **Key ID**, upload the **.p8**  
4. **Add application** → connect your **GitHub** repo (`Saittek/atmos-weather` or the Desktop copy if you push that)  
5. Codemagic detects `codemagic.yaml` automatically.

Optional environment variable on the app:

| Variable | Value |
|----------|--------|
| `VITE_API_BASE` | `https://solaraweather.com` |

---

## Step 5 — First build → TestFlight

1. In Codemagic, open the Solara app  
2. Start workflow: **`ios-testflight`** (`Solara → TestFlight`)  
3. Wait ~15–40 minutes  
4. On success: IPA is uploaded; email goes to your notify address  
5. App Store Connect → your app → **TestFlight**  
   - Wait for Apple “Processing” to finish (can take minutes to an hour)  
   - Add yourself as **Internal tester** and install via the TestFlight app on iPhone  

That is the path **onto devices** before public App Store release.

---

## Step 6 — App Store listing (required before public release)

In App Store Connect for Solara, fill:

- **1.0** version description  
- **Screenshots** (iPhone 6.7" and required sizes)  
- **Privacy Policy URL:** `https://solaraweather.com/privacy.html`  
- **Support URL:** `https://solaraweather.com/support.html`  
- **Category** (e.g. Weather)  
- **Age rating** questionnaire  
- **App Privacy** nutrition labels (location, etc.)  
- **1024×1024** App Store icon  

Until this is complete, use TestFlight only.

---

## Step 7 — Submit for App Store review

When listing + a TestFlight build are ready:

1. Codemagic → run workflow **`ios-app-store-submit`**  
   **or** in App Store Connect pick the build and click **Submit for Review**  
2. Answer export compliance (this app sets `ITSAppUsesNonExemptEncryption` = false)  
3. Wait for **In Review** → **Ready for Sale** (or fix rejection notes)

---

## Workflows in `codemagic.yaml`

| Workflow | What it does |
|----------|----------------|
| `ios-testflight` | Sign, build IPA, upload to **TestFlight** |
| `ios-app-store-submit` | Same + **submit for App Store review** |
| `ios-simulator-check` | Compile only (no upload) |

Automatic signing uses:

```text
app-store-connect fetch-signing-files com.solara.weather --type IOS_APP_STORE --create
```

---

## Common failures

| Error | Fix |
|-------|-----|
| Integration `Solara` not found | Rename the API key in Codemagic UI to exactly `Solara` |
| Bundle ID not found | Register `com.solara.weather` under Apple Developer → Identifiers |
| No app record | Create the app in App Store Connect first |
| Signing / certificate limit | You can only have a few Distribution certs — revoke unused ones or reuse |
| Build number already used | Codemagic increments with `PROJECT_BUILD_NUMBER`; re-run the workflow |
| Rejected for privacy | Ensure privacy URL works and location purpose strings match real use |

---

## Repo checklist

- [x] `codemagic.yaml` with TestFlight + App Store workflows  
- [x] Bundle ID `com.solara.weather`  
- [x] Capacitor iOS project under `ios/App`  
- [x] Privacy / support HTML under `public/`  
- [ ] Apple Developer membership active  
- [ ] API key named **Solara** in Codemagic  
- [ ] GitHub connected; first **`ios-testflight`** build green  
- [ ] App Store screenshots + metadata  
- [ ] Submit for review  

You do the Apple + Codemagic account clicks; Codemagic does the Mac build and upload.
