# Device QA (TestFlight / iPhone)

Run after every TestFlight install. Mark fails and file as bugs.

## Launch
- [ ] Cold start < ~5s to skeleton
- [ ] Location permission → loads nearest place
- [ ] Search place → forecast updates
- [ ] Pull-to-refresh updates temp + “Updated …”

## Right now trust
- [ ] Temp matches local conditions within reason
- [ ] High ≥ current temp; Low ≤ current temp
- [ ] Source line shows blend or Open-Meteo
- [ ] Airplane mode → offline chip + last weather
- [ ] Stale data (>45m) shows a soft “may be outdated” hint

## Alerts
- [ ] Active alerts sit **below** the top bar (not covered)
- [ ] Minimize / expand alerts remembered
- [ ] “What matters now” shows for severe events

## Places
- [ ] Set **Home** (🏠) → reopens that pin
- [ ] Set **Work** → Work chip jumps there
- [ ] Saved places minimize/expand persists

## Maps
- [ ] Radar opens (mobile: opt-in button)
- [ ] Earth globe loads once
- [ ] Storm mode focuses radar

## Widget
- [ ] Open app once with weather loaded
- [ ] Add **Solara Weather** small + medium
- [ ] Temp / H·L / rain % visible
- [ ] Day hint line present when relevant
- [ ] Tap widget opens app

## Notifications
- [ ] Settings → Notify on
- [ ] Sign in for server push when closed
- [ ] Send test notification works (web push)
- [ ] Quiet hours mutes non-extreme (if enabled)

## Theme / a11y
- [ ] Light + dark look correct
- [ ] Reduced motion: no rain/snow particles (or static wash)

## Failures
Note: iOS version, place, screenshot, steps.
See **docs/SHIP_NOW.md** for Codemagic / Apple portal.
