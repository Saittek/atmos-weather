/**
 * Ship preflight — verifies iOS/push/docs readiness before Codemagic / App Store.
 * Usage: node scripts/ship-preflight.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let failed = 0
let warned = 0

function ok(msg) {
  console.log(`  ✓ ${msg}`)
}
function warn(msg) {
  warned++
  console.log(`  ! ${msg}`)
}
function fail(msg) {
  failed++
  console.log(`  ✗ ${msg}`)
}

function read(rel) {
  const p = path.join(root, rel)
  if (!fs.existsSync(p)) return null
  return fs.readFileSync(p, 'utf8')
}

console.log('\nSolara ship preflight\n')

// --- Files ---
console.log('Files')
const must = [
  'codemagic.yaml',
  'capacitor.config.ts',
  'ios/App/App/App.entitlements',
  'ios/App/SolaraWidget/SolaraWidget.entitlements',
  'ios/App/App/Info.plist',
  'scripts/fix-ios-spm-paths.mjs',
  'public/privacy.html',
  'public/support.html',
  'docs/SHIP_NOW.md',
  'docs/APP_STORE_LISTING.md',
  'worker/apns.js',
]
for (const f of must) {
  if (read(f) != null) ok(f)
  else fail(`missing ${f}`)
}

// --- Entitlements ---
console.log('\nEntitlements')
const appEnt = read('ios/App/App/App.entitlements') || ''
if (appEnt.includes('aps-environment')) {
  ok('App: aps-environment (Push) — App ID must have Push Notifications enabled')
  warn('If Codemagic fails on aps-environment: enable Push on App ID or remove aps-environment')
} else {
  ok('App: Push entitlement OFF (archive-safe; web push still works)')
}
if (appEnt.includes('group.com.solara.weather')) ok('App: App Group')
else fail('App missing App Group')

const wEnt = read('ios/App/SolaraWidget/SolaraWidget.entitlements') || ''
if (wEnt.includes('group.com.solara.weather')) ok('Widget: App Group')
else fail('Widget missing App Group')

const info = read('ios/App/App/Info.plist') || ''
if (info.includes('remote-notification')) {
  ok('Info.plist: UIBackgroundModes remote-notification')
} else {
  ok('Info.plist: no remote-notification mode (OK until native APNs)')
}
if (info.includes('NSLocationWhenInUseUsageDescription')) ok('Info.plist: location usage string')
else fail('Info.plist missing location usage')

// --- Codemagic ---
console.log('\nCodemagic')
const cm = read('codemagic.yaml') || ''
if (cm.includes('ios-testflight')) ok('workflow ios-testflight')
else fail('no ios-testflight workflow')
if (cm.includes('com.solara.weather.widget')) ok('widget bundle id in signing')
else fail('widget bundle missing from codemagic')
if (cm.includes('fix-ios-spm-paths')) ok('SPM path fix script')
else warn('SPM fix script not referenced')

// --- Capacitor ---
console.log('\nCapacitor')
const cap = read('capacitor.config.ts') || ''
if (cap.includes("appId: 'com.solara.weather'")) ok('appId com.solara.weather')
else warn('check capacitor appId')

// --- Live health (optional network) ---
console.log('\nLive API')
try {
  const res = await fetch('https://solaraweather.com/api/health', {
    signal: AbortSignal.timeout(12_000),
  })
  if (!res.ok) {
    warn(`health HTTP ${res.status}`)
  } else {
    const j = await res.json()
    ok(`health ok`)
    const s = j.secrets || j
    if (s.jwt === true || s.jwt === 'present') ok('JWT secret present')
    else warn('JWT secret missing on Worker')
    if (s.cron === true || s.cron === 'present') ok('CRON secret present')
    else warn('CRON secret missing')
    if (s.vapidPrivate === true || s.vapidPrivate === 'present') ok('VAPID private present (web push)')
    else warn('VAPID private missing — web push when closed will fail')
    if (s.apns === true || s.apns === 'present') ok('APNs secrets present (native push)')
    else warn('APNs secrets missing — set APNS_* for closed-app iOS alerts')
  }
} catch (e) {
  warn(`health unreachable: ${e instanceof Error ? e.message : e}`)
}

console.log('\n---')
console.log('Manual (cannot automate):')
console.log('  1. Apple: App Group + Push on com.solara.weather + widget App ID')
console.log('  2. Codemagic: Start ios-testflight on main')
console.log('  3. Optional: wrangler secret put APNS_* for native closed-app push')
console.log('  See docs/SHIP_NOW.md')
console.log('---')

if (failed) {
  console.log(`\nFAILED (${failed} error(s), ${warned} warning(s))\n`)
  process.exit(1)
}
console.log(`\nPREFLIGHT OK (${warned} warning(s))\n`)
process.exit(0)
