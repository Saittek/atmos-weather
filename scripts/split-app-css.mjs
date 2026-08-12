/**
 * Split monolithic src/App.css into src/styles/legacy/*.css domain modules.
 * Run once: node scripts/split-app-css.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const appCssPath = path.join(root, 'src', 'App.css')
const backupPath = path.join(root, 'src', 'App.css.pre-split.bak')

const appCss = fs.readFileSync(appCssPath, 'utf8')
// Safety: if already split, abort
if (appCss.includes("import './styles/legacy.css'") || appCss.length < 5000) {
  console.error('App.css already looks split or too small — aborting.')
  process.exit(1)
}

// Backup original once
if (!fs.existsSync(backupPath)) {
  fs.writeFileSync(backupPath, appCss)
  console.log('Backup →', path.relative(root, backupPath))
}

const lines = appCss.split(/\r?\n/)

/** [startLine 1-based, slug, title] */
const cuts = [
  [1, 'base', 'Base tokens, app shell, topbar, panels, dashboard grid, hero'],
  [517, 'alerts-settings', 'Alert strip, settings menus, favorites slots'],
  [1179, 'auth-dashboard', 'Auth, account, current/hourly/daily, sun, maps chrome'],
  [2714, 'radar', 'Embedded + full-page radar (to mobile-perf)'],
  [3813, 'mobile-perf', 'Mobile performance mode'],
  [3930, 'feature-panels', 'Feature panels through allergies'],
  [5580, 'mode-radar-widget', 'Full-page radar, widget pages'],
  [6100, 'core-modules', 'Core weather modules, chat, outdoor, dress, onboarding'],
  [7383, 'chase-videos-glance', 'Storm chaser, videos, glance modules'],
  [8871, 'globe', '3D Earth globe'],
  [9612, 'home-extras', 'What matters, heroes, prefs, coach'],
  [10695, 'globe-bodies-stargaze', 'Globe bodies + Stargaze page'],
]

const outDir = path.join(root, 'src', 'styles', 'legacy')
fs.mkdirSync(outDir, { recursive: true })

function endLine(i) {
  if (i + 1 < cuts.length) return cuts[i + 1][0] - 1
  return lines.length
}

const imports = []
for (let i = 0; i < cuts.length; i++) {
  const [start, slug, title] = cuts[i]
  const end = endLine(i)
  const chunk = lines.slice(start - 1, end)
  const name = `${String(i).padStart(2, '0')}-${slug}.css`
  const file = path.join(outDir, name)
  const header = [
    '/**',
    ` * ${title}`,
    ` * Split from App.css (legacy) — original lines ${start}–${end}`,
    ' * Redesign layers (tokens + redesign*.css) load after this stack.',
    ' */',
    '',
  ]
  const body = chunk.join('\n')
  fs.writeFileSync(file, header.join('\n') + body + (body.endsWith('\n') ? '' : '\n'))
  imports.push(`./legacy/${name}`)
  console.log(name, `lines ${start}-${end}`, `(${end - start + 1})`)
}

const barrel = [
  '/**',
  ' * Legacy App.css domain modules (split for maintainability).',
  ' * Import order is load order. App.tsx still imports redesign after theme-light.',
  ' */',
  ...imports.map((p) => `@import '${p}';`),
  '',
].join('\n')
fs.writeFileSync(path.join(root, 'src', 'styles', 'legacy.css'), barrel)

const slimApp = [
  '/**',
  ' * Solara styles entry — legacy domain split.',
  ' * Visual redesign: styles/tokens.css + redesign*.css (from App.tsx).',
  ' */',
  "@import './styles/legacy.css';",
  '',
].join('\n')
fs.writeFileSync(appCssPath, slimApp)

console.log('Wrote src/styles/legacy.css + slim src/App.css')
console.log('Modules:', imports.length)
