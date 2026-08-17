/**
 * Resolve semantic icon names against Iconify JSON packs.
 * Missing icons fall back to each pack's widget glyph so maps stay complete.
 *
 * Usage: node scripts/icons/build-provider-maps.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const mapsDir = path.join(root, 'src/modules/app/icons/maps')

const PROVIDERS = [
  {
    name: 'iconoir',
    prefix: 'iconoir',
    package: 'iconoir',
    fallback: 'view-grid',
    suffixes: ['', '-solid'],
    overrides: {
      chart: 'stats-report',
      checks: 'double-check',
      close: 'xmark',
      'close-circle': 'xmark-circle',
      document: 'page',
      'document-add': 'page-plus',
      'dots-menu': 'more-horiz',
      file: 'empty-page',
      graph: 'graph-up',
      'trend-up': 'graph-up',
      // iconoir ships no layers/stack glyph; stacked pages is the closest read.
      layers: 'multiple-pages',
      monitor: 'computer',
      'palette-round': 'color-wheel',
      sun: 'sun-light',
      tuning: 'filter',
      users: 'group',
    },
  },
  {
    name: 'tabler',
    prefix: 'tabler',
    package: 'tabler',
    fallback: 'layout-grid',
    suffixes: [''],
    overrides: {
      'check-circle': 'circle-check',
      checks: 'checks',
      'close-circle': 'circle-x',
      emoji: 'mood-smile',
      layers: 'stack-2',
      'minus-circle': 'circle-minus',
      monitor: 'device-desktop',
      'palette-round': 'brush',
      'shield-warning': 'shield-exclamation',
    },
  },
  {
    name: 'mingcute',
    prefix: 'mingcute',
    package: 'mingcute',
    fallback: 'layout-grid-line',
    suffixes: ['-line', '-fill'],
    overrides: {
      'chevron-down': 'down-line',
      'chevron-right': 'right-line',
      database: 'server-line',
      document: 'document-line',
      'document-add': 'file-new-line',
      'info-circle': 'information-line',
      list: 'list-ordered-line',
      login: 'entrance-line',
      logout: 'exit-line',
      'palette-round': 'brush-line',
      // No shield+check or shield+alert glyph; certificate carries the check.
      'shield-check': 'safety-certificate-line',
      'shield-user': 'shield-shape-line',
      'shield-warning': 'warning-line',
      sidebar: 'layout-left-line',
      spinner: 'loading-line',
      'user-plus': 'user-add-line',
      users: 'group-line',
    },
  },
  {
    name: 'remix',
    prefix: 'ri',
    package: 'ri',
    fallback: 'layout-grid-line',
    suffixes: ['-line', '-fill'],
    overrides: {
      bolt: 'flashlight-line',
      checks: 'check-double-line',
      'check-circle': 'checkbox-circle-line',
      'chevron-down': 'arrow-down-s-line',
      'chevron-right': 'arrow-right-s-line',
      clock: 'time-line',
      'close-circle': 'close-circle-line',
      'document-add': 'file-add-line',
      dollar: 'money-dollar-circle-line',
      emoji: 'emotion-line',
      graph: 'line-chart-line',
      'info-circle': 'information-line',
      layers: 'stack-line',
      list: 'list-unordered',
      'minus-circle': 'indeterminate-circle-line',
      monitor: 'computer-line',
      send: 'send-plane-line',
      'shield-user': 'shield-user-line',
      'shield-warning': 'shield-cross-line',
      sidebar: 'side-bar-line',
      'trend-up': 'line-chart-line',
      'user-plus': 'user-add-line',
      users: 'group-line',
    },
  },
  {
    name: 'griddy',
    prefix: 'griddy-icons',
    package: 'griddy-icons',
    fallback: 'layout',
    suffixes: [''],
    overrides: {
      bell: 'notification',
      checks: 'check-double',
      clock: 'time',
      close: 'close',
      'close-circle': 'close-circle',
      letter: 'email',
      list: 'list-bulleted',
      palette: 'colors',
      'palette-round': 'paint-brush',
      'shield-user': 'shield-person',
      tuning: 'tune-horizontal',
      widget: 'layout',
      'zoom-in': 'search-plus',
      'zoom-out': 'search-minus',
    },
  },
  {
    name: 'iconamoon',
    prefix: 'iconamoon',
    package: 'iconamoon',
    fallback: 'apps',
    suffixes: ['', '-duotone', '-bold', '-light', '-fill', '-thin'],
    overrides: {
      bell: 'notification',
      bolt: 'lightning-1',
      'check-circle': 'check-circle-1',
      'chevron-down': 'arrow-down-2',
      'chevron-right': 'arrow-right-2',
      'danger-triangle': 'attention-circle',
      database: 'box',
      document: 'file-document',
      'document-add': 'file-add',
      'dots-menu': 'menu-kebab-horizontal',
      emoji: 'smiling-face',
      graph: 'trend-up',
      // iconamoon's `apps` glyph is itself a 2x2 grid, so this is a real match.
      grid: 'apps',
      'info-circle': 'information-circle',
      layers: 'component',
      letter: 'email',
      list: 'playlist',
      login: 'enter',
      logout: 'exit',
      menu: 'menu-burger-horizontal',
      'minus-circle': 'sign-minus-circle',
      moon: 'mode-dark',
      refresh: 'synchronize',
      'shield-check': 'shield-yes',
      'shield-user': 'shield',
      'shield-warning': 'shield-no',
      'shopping-cart': 'shopping-card',
      spinner: 'restart',
      sun: 'mode-light',
      'trend-up': 'trend-up',
      truck: 'delivery',
      tuning: 'options',
      'user-plus': 'profile-circle',
      users: 'profile',
      widget: 'category',
      'zoom-in': 'zoom-in',
      'zoom-out': 'zoom-out',
    },
  },
]

/**
 * Semantics with no honest glyph in a given pack. Listed here so the fallback
 * is a deliberate, reviewed decision rather than whatever fuzzy matching found.
 */
const KNOWN_GAPS = {
  iconamoon: [
    'chart',
    'code',
    'dollar',
    'monitor',
    'palette',
    'palette-round',
    'rocket',
    'sidebar',
  ],
}

/** Extra lookup names per semantic icon (shared across providers). */
const SEMANTIC_ALIASES = {
  bolt: ['zap', 'flash', 'lightning', 'bolt', 'flash-line', 'lightning-line'],
  widget: ['layout-grid', 'widget', 'apps', 'grid', 'view-grid', 'squares-four'],
  chart: ['bar-chart-3', 'chart-bar', 'chart', 'bar-chart', 'chart-square'],
  graph: ['trending-up', 'trend-up', 'graph', 'chart-line', 'graph-new-up'],
  login: ['log-in', 'login', 'sign-in', 'login-2', 'login-box', 'login-circle'],
  logout: ['log-out', 'logout', 'sign-out', 'logout-2', 'logout-box', 'logout-circle'],
  menu: ['menu-2', 'menu', 'hamburger-menu', 'list', 'menu-line'],
  checks: ['check-check', 'checks', 'check-double', 'check-read', 'check-all'],
  check: ['check', 'unread', 'check-2'],
  tuning: ['sliders-horizontal', 'tuning', 'adjustments-horizontal', 'sliders', 'settings-3'],
  'shield-user': ['shield', 'shield-user', 'user-shield', 'shield-check'],
  'danger-triangle': ['alert-triangle', 'warning', 'danger-triangle', 'warning-triangle'],
  'info-circle': ['info', 'info-circle'],
  'close-circle': ['x-circle', 'close-circle', 'circle-x'],
  'chevron-down': ['chevron-down', 'caret-down', 'alt-arrow-down', 'nav-arrow-down'],
  'chevron-right': ['chevron-right', 'caret-right', 'alt-arrow-right', 'nav-arrow-right'],
  spinner: ['loader-2', 'loader', 'spinner', 'refresh-circle', 'loading'],
  refresh: ['refresh-cw', 'refresh', 'arrows-clockwise', 'reload'],
  sidebar: ['panel-left', 'sidebar', 'layout-sidebar', 'sidebar-minimalistic'],
  search: ['search', 'magnifer', 'magnifying-glass', 'search-2'],
  document: ['file-text', 'document-text', 'document', 'document-2'],
  'document-add': ['file-plus', 'document-add', 'document-add-2'],
  'user-plus': ['user-plus', 'user-add'],
  'dots-menu': ['more-horizontal', 'dots', 'menu-dots', 'dots-three', 'more-2'],
  'palette-round': ['paintbrush', 'palette-round', 'paint-brush'],
  'shield-warning': ['shield-alert', 'shield-warning'],
  'zoom-in': ['zoom-in', 'magnifier-zoom-in', 'magnifying-glass-plus', 'search-zoom-in'],
  'zoom-out': ['zoom-out', 'magnifier-zoom-out', 'magnifying-glass-minus', 'search-zoom-out'],
  'trend-up': ['trending-up', 'trend-up'],
  'shopping-cart': ['shopping-cart', 'cart', 'cart-large', 'shopping-bag'],
  letter: ['mail', 'letter', 'envelope', 'mail-send'],
  emoji: ['smile', 'emoji', 'smiley', 'emoji-funny-circle'],
  dollar: ['dollar-sign', 'currency-dollar', 'dollar', 'dollar-minimalistic'],
  grid: ['grid-3x3', 'grid-4', 'grid', 'widget-4', 'layout-grid'],
  send: ['send', 'plain', 'paper-plane', 'send-2'],
  truck: ['truck', 'delivery'],
  card: ['credit-card', 'card'],
  database: ['database'],
  settings: ['settings', 'gear', 'settings-1', 'settings-2'],
  home: ['home', 'home-2', 'house'],
  users: ['users', 'users-group', 'user-group'],
  sun: ['sun', 'sun-2'],
  moon: ['moon', 'moon-2'],
  star: ['star'],
  file: ['file'],
  code: ['code', 'code-square'],
  monitor: ['monitor', 'desktop'],
  bell: ['bell', 'bell-2'],
  folder: ['folder-open', 'folder'],
  edit: ['pencil', 'pen', 'edit'],
  list: ['list'],
  clock: ['clock', 'clock-circle'],
  download: ['download', 'download-minimalistic'],
  'minus-circle': ['minus-circle'],
  'check-circle': ['check-circle'],
  close: ['x', 'close'],
  lock: ['lock', 'lock-password'],
  palette: ['palette'],
  rocket: ['rocket'],
  layers: ['layers'],
  'arrow-left': ['arrow-left'],
  'arrow-right': ['arrow-right'],
  'arrow-up': ['arrow-up'],
  'arrow-down': ['arrow-down'],
  'shield-check': ['shield-check'],
}

function parseLucideMap() {
  const source = fs.readFileSync(path.join(mapsDir, 'lucide.ts'), 'utf8')
  const entries = new Map()
  const pattern = /(?:^|\n)\s*(?:'([^']+)'|([A-Za-z_$][\w$]*))\s*:\s*'i-lucide-([^']+)'/g
  let match
  while ((match = pattern.exec(source)) !== null) {
    entries.set(match[1] ?? match[2], match[3])
  }
  return entries
}

function loadCollection(packageName) {
  const jsonPath = path.join(root, `node_modules/@iconify-json/${packageName}/icons.json`)
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
  const icons = new Set(Object.keys(data.icons ?? {}))
  for (const [alias, meta] of Object.entries(data.aliases ?? {})) {
    if (meta.parent) icons.add(alias)
  }
  return { prefix: data.prefix, icons: [...icons] }
}

function expandBases(base) {
  const out = new Set([base])
  // settings-1-line -> also try settings, settings-1, settings-2
  const parts = base.split('-')
  if (parts.length > 1) out.add(parts[0])
  return [...out]
}

function candidateNames(semantic, lucideName, suffixes) {
  const bases = new Set()
  if (lucideName) {
    for (const part of expandBases(lucideName)) bases.add(part)
  }
  if (SEMANTIC_ALIASES[semantic]) {
    for (const alias of SEMANTIC_ALIASES[semantic]) {
      for (const part of expandBases(alias)) bases.add(part)
    }
  }
  for (const part of expandBases(semantic)) bases.add(part)

  const candidates = []
  for (const base of bases) {
    for (const suffix of suffixes) {
      candidates.push(`${base}${suffix}`)
      if (suffix && !suffix.startsWith('-')) candidates.push(`${base}-${suffix}`)
    }
    // numbered variants: settings -> settings-1-line
    for (let i = 1; i <= 4; i++) {
      for (const suffix of suffixes) {
        candidates.push(`${base}-${i}${suffix}`)
      }
    }
  }
  return candidates
}

function fuzzyFind(base, icons) {
  const exact = icons.find((icon) => icon === base)
  if (exact) return exact

  const endsWith = icons.filter((icon) => icon.endsWith(`-${base}`) || icon.endsWith(base))
  if (endsWith.length === 1) return endsWith[0]
  if (endsWith.length > 1) {
    const preferred = endsWith.find((icon) => icon.endsWith('-line')) ?? endsWith[0]
    return preferred
  }

  const contains = icons.filter(
    (icon) =>
      icon.includes(`-${base}-`) || icon.startsWith(`${base}-`) || icon.includes(`-${base}`),
  )
  if (contains.length === 1) return contains[0]
  if (contains.length > 1) {
    const preferred =
      contains.find((icon) => icon.endsWith('-line')) ??
      contains.find((icon) => !icon.includes('-solid') && !icon.includes('-fill')) ??
      contains[0]
    return preferred
  }

  return null
}

function resolveIconName(semantic, lucideName, icons, suffixes) {
  const candidates = candidateNames(semantic, lucideName, suffixes)
  for (const name of candidates) {
    if (icons.includes(name)) return name
  }

  const searchBases = new Set(
    [semantic, lucideName, ...(SEMANTIC_ALIASES[semantic] ?? [])].filter(Boolean),
  )
  for (const base of searchBases) {
    for (const part of expandBases(base)) {
      const hit = fuzzyFind(part, icons)
      if (hit) return hit
    }
  }

  return null
}

function resolveFallback(fallback, icons, suffixes) {
  const candidates = candidateNames('widget', 'layout-grid', suffixes)
  candidates.unshift(fallback)
  for (const name of candidates) {
    if (icons.includes(name)) return name
  }
  return fuzzyFind('apps', icons) ?? fuzzyFind('grid', icons) ?? icons[0]
}

function formatKey(key) {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : `'${key}'`
}

function writeMap({ name, varName, prefix, resolved, fallbacks }) {
  const lines = [...resolved.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, iconName]) => `  ${formatKey(key)}: 'i-${prefix}-${iconName}',`)

  const content = `import type { IconMap } from '~/types'

/**
 * ${name} icon provider.
 *
 * Mapped against Iconify \`${prefix}\` with \`widget\` fallback for missing glyphs.
 * Regenerate candidates: \`node scripts/icons/build-provider-maps.mjs\`
 */
export const ${varName}: IconMap = {
${lines.join('\n')}
}
`

  fs.writeFileSync(path.join(mapsDir, `${name}.ts`), content)

  if (fallbacks.length) {
    console.log(`  ${name}: ${fallbacks.length} fallback(s) → widget`)
    for (const item of fallbacks.slice(0, 8)) {
      console.log(`    - ${item.semantic} → ${item.fallback}`)
    }
    if (fallbacks.length > 8) console.log(`    … and ${fallbacks.length - 8} more`)
  } else {
    console.log(`  ${name}: all icons resolved`)
  }
}

/**
 * Every prefix here must also be registered in the Tailwind icons plugin, or
 * the classes generate but no CSS backs them and the icons render blank.
 */
function assertRegisteredCollections() {
  const pluginPath = path.join(root, 'src/modules/app/styles/icons-plugin.mjs')
  const source = fs.readFileSync(pluginPath, 'utf8')
  const missing = PROVIDERS.filter((p) => !source.includes(`'${p.package}'`))
  if (missing.length) {
    throw new Error(
      `Not registered in icons-plugin.mjs: ${missing.map((p) => p.package).join(', ')}. ` +
        `Add them to the collections list or their classes will render blank.`,
    )
  }
}

const lucideMap = parseLucideMap()

assertRegisteredCollections()

console.log('Building icon provider maps…')
let invalid = 0
for (const provider of PROVIDERS) {
  const { icons } = loadCollection(provider.package)
  const iconSet = new Set(icons)
  const widgetFallback = resolveFallback(provider.fallback, icons, provider.suffixes)
  const resolved = new Map()
  const fallbacks = []

  for (const [semantic, lucideName] of lucideMap) {
    const override = provider.overrides?.[semantic]
    if (override) {
      resolved.set(semantic, override)
      continue
    }

    const iconName = resolveIconName(semantic, lucideName, icons, provider.suffixes)
    if (iconName) {
      resolved.set(semantic, iconName)
    } else {
      resolved.set(semantic, widgetFallback)
      fallbacks.push({ semantic, lucide: lucideName, fallback: widgetFallback })
    }
  }

  // Overrides are hand-written, so a typo here is otherwise invisible until the
  // icon silently renders blank in the browser.
  for (const [semantic, iconName] of resolved) {
    if (!iconSet.has(iconName)) {
      console.error(`  ✗ ${provider.name}: '${semantic}' → '${iconName}' does not exist`)
      invalid++
    }
  }

  const gaps = new Set(KNOWN_GAPS[provider.name] ?? [])
  for (const item of fallbacks) {
    if (!gaps.has(item.semantic)) {
      console.error(
        `  ✗ ${provider.name}: '${item.semantic}' has no match — add an override or list it in KNOWN_GAPS`,
      )
      invalid++
    }
  }

  writeMap({
    name: provider.name,
    varName: `${provider.name}IconMap`,
    prefix: provider.prefix,
    resolved,
    fallbacks,
  })
}

if (invalid > 0) {
  console.error(`\n${invalid} invalid mapping(s). Fix them before committing.`)
  process.exit(1)
}

console.log('Done.')
