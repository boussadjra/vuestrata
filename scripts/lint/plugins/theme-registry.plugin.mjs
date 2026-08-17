import fs from 'node:fs'
import path from 'node:path'

/**
 * A theme is only real when four separate files agree about it.
 *
 * Adding one means touching:
 *   1. `styles/themes/<name>.css`            — the ramps themselves
 *   2. `styles/app.css`                      — an @import, BEFORE semantic.css
 *   3. `config/theme.config.ts`              — the `builtinThemes` entry
 *   4. `types/index.ts`                      — the `ThemeName` union member
 *
 * Miss any one and the failure is quiet rather than loud. No union member means
 * no type error at call sites but no autocomplete either. No registry entry
 * means the theme never appears in the settings picker, so nobody can select
 * it. No @import means the class resolves to nothing and the app silently
 * renders the default palette. Worst of all: an @import placed AFTER
 * semantic.css loads the ramps too late for the semantic tokens to alias them,
 * which produces a theme that is *almost* right — correct accents, wrong
 * surfaces — and looks like a design mistake rather than a build-order one.
 *
 * ── On ramps ───────────────────────────────────────────────────────────────
 * Themes define four ramps: primary, secondary, accent, surface. `danger` is
 * the fifth ramp the semantic layer reads, but it is declared once for all
 * themes in app.css — destructive actions stay red regardless of theme — so it
 * is NOT required here. A theme may still override it.
 *
 * `default` is exempt from every file check: it is the bare `:root` in
 * semantic.css, has `cssClass: ''`, and deliberately has no CSS file.
 */

const TYPES_FILE = 'src/modules/app/types/index.ts'
const CONFIG_FILE = 'src/modules/app/config/theme.config.ts'
const APP_CSS = 'src/modules/app/styles/app.css'
const THEMES_DIR = 'src/modules/app/styles/themes'

const SEMANTIC_IMPORT = './semantic.css'
const REQUIRED_RAMPS = ['primary', 'secondary', 'accent', 'surface']

/** The one theme that is the absence of a theme. */
const BASE_THEME = 'default'

export function themeRegistryPlugin() {
  return {
    name: 'theme-registry',
    check({ root, logger }) {
      const read = (rel) => {
        const full = path.join(root, rel)
        return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null
      }

      const typesSource = read(TYPES_FILE)
      const configSource = read(CONFIG_FILE)
      const appCssSource = read(APP_CSS)

      for (const [rel, source] of [
        [TYPES_FILE, typesSource],
        [CONFIG_FILE, configSource],
        [APP_CSS, appCssSource],
      ]) {
        if (source === null) {
          logger.error(`Cannot find ${rel} — theme-registry has nothing to check against.`)
          return { ok: false, message: `theme-registry: ${rel} missing` }
        }
      }

      const union = parseThemeNameUnion(typesSource)
      const registered = parseBuiltinThemes(configSource)

      if (union.size === 0 || registered.size === 0) {
        logger.error(
          `Could not parse the theme declarations (union from ${TYPES_FILE}, ` +
            `builtinThemes from ${CONFIG_FILE}). If their shape changed, update ` +
            'scripts/lint/plugins/theme-registry.plugin.mjs to match.',
        )
        return { ok: false, message: 'theme-registry: could not parse declarations' }
      }

      const imports = parseThemeImportOrder(appCssSource)
      const problems = []

      // ── Union ↔ registry ────────────────────────────────────────────────
      for (const name of union) {
        if (!registered.has(name)) {
          problems.push(
            `'${name}' is in the ThemeName union but has no builtinThemes entry in ${CONFIG_FILE} — ` +
              'it will never appear in the theme picker.',
          )
        }
      }
      for (const [name] of registered) {
        if (!union.has(name)) {
          problems.push(
            `'${name}' is registered in ${CONFIG_FILE} but missing from the ThemeName union in ${TYPES_FILE}.`,
          )
        }
      }

      // ── Per-theme file contract ─────────────────────────────────────────
      for (const [name, cssClass] of registered) {
        if (name === BASE_THEME) {
          if (cssClass !== '') {
            problems.push(
              `'${BASE_THEME}' must keep \`cssClass: ''\` — it is the bare :root, not a theme class.`,
            )
          }
          continue
        }

        const expectedClass = `theme-${name}`
        if (cssClass !== expectedClass) {
          problems.push(
            `'${name}' declares cssClass '${cssClass}' but the convention is '${expectedClass}'.`,
          )
        }

        const cssRel = `${THEMES_DIR}/${name}.css`
        const cssSource = read(cssRel)
        if (cssSource === null) {
          problems.push(`'${name}' has no stylesheet at ${cssRel}.`)
          continue
        }

        const importIndex = imports.themes.indexOf(`./themes/${name}.css`)
        if (importIndex === -1) {
          problems.push(
            `${cssRel} is never @imported by ${APP_CSS} — the theme class will resolve to nothing.`,
          )
        } else if (imports.semanticIndex !== -1 && importIndex > imports.semanticIndex) {
          problems.push(
            `${cssRel} is @imported AFTER ${SEMANTIC_IMPORT} in ${APP_CSS}. Theme ramps must load ` +
              'first or the semantic tokens alias values that do not exist yet.',
          )
        }

        const missingRamps = REQUIRED_RAMPS.filter(
          (ramp) => !new RegExp(String.raw`--color-${ramp}-\d`).test(cssSource),
        )
        if (missingRamps.length > 0) {
          problems.push(
            `${cssRel} defines no ${missingRamps.join('/')} ramp. Required ramps: ${REQUIRED_RAMPS.join(', ')}.`,
          )
        }

        if (!new RegExp(String.raw`:root\.theme-${name}\b`).test(cssSource)) {
          problems.push(`${cssRel} never declares a \`:root.theme-${name}\` block.`)
        }
        if (!new RegExp(String.raw`:root\.theme-${name}\.dark\b`).test(cssSource)) {
          problems.push(
            `${cssRel} has no \`:root.theme-${name}.dark\` block — the theme has no dark mode.`,
          )
        }
      }

      if (problems.length > 0) {
        logger.error('Theme registry is inconsistent. A theme needs all four files to agree:')
        for (const problem of problems) logger.error(`- ${problem}`)
        return { ok: false, message: `${problems.length} theme registry problem(s)` }
      }

      logger.success(
        `Theme registry is consistent: ${registered.size} theme(s) wired across ` +
          'types, config, imports and stylesheets.',
      )
      return { ok: true }
    },
  }
}

/** Members of `export type ThemeName = | 'a' | 'b' … `, ignoring `(string & {})`. */
function parseThemeNameUnion(source) {
  const names = new Set()
  const start = source.indexOf('export type ThemeName')
  if (start === -1) return names

  const lines = source.slice(start).split(/\r?\n/)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line === '') continue
    const match = line.match(/^\|\s*'([^']+)'/)
    if (match) {
      names.add(match[1])
      continue
    }
    // `| (string & {})` keeps the union open for runtime-registered themes;
    // it is not a builtin, so skip it and keep reading.
    if (/^\|\s*\(string\s*&/.test(line)) continue
    break
  }

  return names
}

/** `{ name: 'ocean', label: 'Ocean', cssClass: 'theme-ocean' }` → Map(name → cssClass). */
function parseBuiltinThemes(source) {
  const themes = new Map()
  const start = source.indexOf('builtinThemes')
  if (start === -1) return themes

  // Seek the `[` that opens the array literal, not the one in the type
  // annotation — `const builtinThemes: ThemeConfig[] = [` contains both, and
  // taking the first `]` would slice an empty block out of `ThemeConfig[]`.
  const assign = source.indexOf('=', start)
  const arrayStart = assign === -1 ? -1 : source.indexOf('[', assign)
  if (arrayStart === -1) return themes

  // Entries are one-per-line object literals, so the array ends at the first
  // `]` sitting at the start of a line.
  const endMatch = /\n\s*\]/.exec(source.slice(arrayStart))
  const block = source.slice(arrayStart, endMatch ? arrayStart + endMatch.index : undefined)

  const pattern = /name:\s*'([^']+)'[^}]*?cssClass:\s*'([^']*)'/g
  let match
  while ((match = pattern.exec(block)) !== null) {
    themes.set(match[1], match[2])
  }

  return themes
}

/**
 * Theme @imports in source order, plus where semantic.css sits among them.
 * Order is the whole point — see the header note about late imports.
 */
function parseThemeImportOrder(source) {
  const themes = []
  let semanticIndex = -1

  const pattern = /@import\s+'([^']+)'/g
  let match
  let index = 0
  while ((match = pattern.exec(source)) !== null) {
    const target = match[1]
    if (target === SEMANTIC_IMPORT) {
      semanticIndex = index
    } else if (target.startsWith('./themes/')) {
      themes[index] = target
    }
    index++
  }

  // Preserve positional indices so comparisons against semanticIndex are valid.
  return { themes: Array.from(themes, (v) => v ?? ''), semanticIndex }
}
