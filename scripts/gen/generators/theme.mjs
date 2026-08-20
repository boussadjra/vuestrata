import { kebab, title } from '../lib/naming.mjs'
import { insertBeforeSentinel, insertUnionMember, SENTINELS } from '../lib/registry.mjs'

/**
 * Scaffold a theme.
 *
 * A theme lives in four places (stylesheet, app.css import, theme.config.ts,
 * ThemeName union) and three of them are easy to forget. Worse, the import has
 * to land BEFORE semantic.css or the ramps load too late for the semantic
 * tokens to alias them — producing a theme that is subtly wrong rather than
 * obviously broken. The generator puts all four in place; theme-registry lint
 * then keeps them in agreement.
 *
 * The emitted ramps are a neutral grey scale, deliberately. A generator that
 * invented a palette would produce something that looks designed and is not —
 * the point is a correct skeleton you replace with real colour.
 */
export function planTheme({ plan, positional, options }) {
  const raw = positional[0]
  if (!raw) throw new Error('a theme name is required, e.g. `vpr gen:theme midnight`')

  const name = kebab(raw)
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error(`"${name}" is not a valid theme name (lowercase, digits and dashes only)`)
  }
  if (name === 'default') {
    throw new Error('`default` is the bare :root, not a theme file — pick another name')
  }

  const label = options.label ?? title(name)

  plan.addFile(`src/modules/app/styles/themes/${name}.css`, stylesheet(name, label))

  plan.addEdit(
    'src/modules/app/styles/app.css',
    `@import the ${name} stylesheet before semantic.css`,
    (source) =>
      insertBeforeSentinel(source, SENTINELS.themeImports, `@import './themes/${name}.css';`, {
        comment: '/*',
      }),
  )

  plan.addEdit(
    'src/modules/app/config/theme.config.ts',
    `register ${name} in builtinThemes`,
    (source) =>
      insertBeforeSentinel(
        source,
        SENTINELS.themes,
        `{ name: '${name}', label: '${label}', cssClass: 'theme-${name}' },`,
      ),
  )

  plan.addEdit('src/modules/app/types/index.ts', `add '${name}' to the ThemeName union`, (source) =>
    insertUnionMember(source, 'ThemeName', name),
  )

  plan.addNote(
    `Replace the placeholder ramps in src/modules/app/styles/themes/${name}.css. ` +
      'Every step is used: semantic.css aliases 50–950 across all four ramps.',
  )
  plan.addNote(
    `If the theme names a font family that is not already loaded, add it to the Google Fonts ` +
      'link in index.html — a --font-sans that was never fetched silently falls back.',
  )
  plan.addNote(
    `Add { theme: '${name}', dark: false } to the axe matrix in e2e/accessibility.spec.ts so the ` +
      'new palette is contrast-checked.',
  )

  return plan
}

/**
 * Ramps are emitted as a neutral grey so the theme is immediately *valid* and
 * obviously *unfinished*. `danger` is intentionally absent: it is declared once
 * for every theme in app.css, because a destructive action should read as
 * destructive no matter which theme is active.
 */
function stylesheet(name, label) {
  const ramp = (token, steps) =>
    steps.map((value, index) => `  --color-${token}-${STEPS[index]}: ${value};`).join('\n')

  return `/*
 * ${label} theme.
 *
 * GENERATED SKELETON — the ramps below are a neutral grey placeholder. Replace
 * them with the real palette; the structure is already correct.
 *
 * Define four ramps (primary, secondary, accent, surface) in both colour modes
 * and every semantic token in semantic.css follows automatically. Override an
 * individual semantic token only where this theme's character genuinely demands
 * it — do NOT restate a whole ramp.
 *
 * \`danger\` is deliberately not defined here: app.css declares it once for all
 * themes so destructive actions stay red.
 */

:root.theme-${name} {
${ramp('primary', LIGHT_NEUTRAL)}

${ramp('secondary', LIGHT_NEUTRAL)}

${ramp('accent', LIGHT_NEUTRAL)}

${ramp('surface', LIGHT_SURFACE)}
}

:root.theme-${name}.dark {
${ramp('primary', DARK_NEUTRAL)}

${ramp('secondary', DARK_NEUTRAL)}

${ramp('accent', DARK_NEUTRAL)}

${ramp('surface', DARK_SURFACE)}
}
`
}

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

const LIGHT_NEUTRAL = [
  '#f8fafc',
  '#f1f5f9',
  '#e2e8f0',
  '#cbd5e1',
  '#94a3b8',
  '#64748b',
  '#475569',
  '#334155',
  '#1e293b',
  '#0f172a',
  '#020617',
]

const DARK_NEUTRAL = [
  '#020617',
  '#0f172a',
  '#1e293b',
  '#334155',
  '#475569',
  '#64748b',
  '#94a3b8',
  '#cbd5e1',
  '#e2e8f0',
  '#f1f5f9',
  '#f8fafc',
]

const LIGHT_SURFACE = LIGHT_NEUTRAL
const DARK_SURFACE = DARK_NEUTRAL
