# Ship iOS (one-button path)

**Full master checklist (Apple portal + Codemagic + secrets):** **`docs/SHIP_NOW.md`**

Web deploys with `npm run deploy`. **Native Solara** only updates after a **Codemagic** build.

## Automatic (preferred)

`codemagic.yaml` → workflow **`ios-testflight`** is configured to trigger on **push to `main`**.

1. In [codemagic.io](https://codemagic.io) open the Solara app  
2. **Webhooks** / repository settings → ensure GitHub can notify Codemagic  
3. Confirm workflow **Solara → TestFlight** shows “Triggered by push” for branch **main**  
4. Every `git push origin main` should start a build  

If auto-trigger is off, use the manual path below.

## Manual one-button

1. Codemagic → Solara → **Start new build**  
2. Workflow: **`ios-testflight`** (`Solara → TestFlight`)  
3. Branch: **`main`**  
4. Wait for green → TestFlight processing → install on phone  

## After install smoke

- [ ] App opens and loads weather  
- [ ] Set **Home**, open once so the widget snapshot writes  
- [ ] Home Screen → **Add Widget** → Solara  
- [ ] Settings → **Notify** on (optional quiet hours)  
- [ ] Radar + Earth open without crash  

## Related docs

- `docs/TESTFLIGHT_CHECKLIST.md`  
- `docs/CODEMAGIC_APP_STORE.md`  
- `docs/APP_STORE_LISTING.md`  

## Keep web + app in sync

| Surface | How it updates |
|---------|----------------|
| solaraweather.com | `npm run deploy` / push + Workers Builds if configured |
| TestFlight IPA | Codemagic **`ios-testflight`** on `main` |

Avoid long gaps where web has features the last TestFlight build doesn’t.
