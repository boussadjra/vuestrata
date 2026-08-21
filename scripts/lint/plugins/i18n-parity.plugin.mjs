import fs from 'node:fs'
import path from 'node:path'

/**
 * Every locale in a translation folder must declare the same keys.
 *
 * Vuestrata ships `en`, `fr` and `ar` across ~45 JSON files: one shell catalog
 * in `src/modules/app/locales/` plus an `i18n/` folder per module. vue-i18n
 * falls back to `en` for a missing key and renders it without complaint, so an
 * Arabic gap looks exactly like a working build until an Arabic speaker opens
 * the page. Nothing else in the toolchain can see it: the JSON is valid, the
 * types are structurally unrelated, and no test asserts on translated copy.
 *
 * This rule hard-fails rather than ratcheting. The repo was at full parity when
 * it was introduced, so there is no legacy debt to grandfather in — the honest
 * default is that adding a key to `en` and nowhere else is a mistake.
 *
 * Adding a language: create `<code>.json` in every folder listed by this rule.
 * It will then be compared like the rest, which is the point.
 */

const SHELL_LOCALES_DIR = 'src/modules/app/locales'
const MODULES_DIR = 'src/modules'
const MODULE_LOCALES_SUBDIR = 'i18n'

/** How many missing keys to print per locale before truncating. */
const MAX_REPORTED = 12

export function i18nParityPlugin() {
  return {
    name: 'i18n-parity',
    check({ root, logger }) {
      const dirs = collectLocaleDirs(root)

      if (dirs.length === 0) {
        logger.error(
          `No locale folders found. Expected ${SHELL_LOCALES_DIR} and/or ${MODULES_DIR}/*/${MODULE_LOCALES_SUBDIR}.`,
        )
        return { ok: false, message: 'i18n-parity found nothing to check' }
      }

      const problems = []
      let totalKeys = 0
      let totalFiles = 0

      for (const dir of dirs) {
        const rel = path.relative(root, dir).replaceAll('\\', '/')
        const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
        if (files.length === 0) continue

        const byLocale = new Map()
        for (const file of files) {
          const full = path.join(dir, file)
          let parsed
          try {
            parsed = JSON.parse(fs.readFileSync(full, 'utf8'))
          } catch (error) {
            problems.push({ dir: rel, invalid: `${file}: ${error.message}` })
            continue
          }
          // `en.overrides.json` is folded into `en` rather than compared as a
          // locale of its own. It is the same language — the split is about who
          // owns the file, not what it says — and treating it separately would
          // report every shell key as missing from a file that only ever holds
          // the handful someone chose to reword.
          const locale = localeOf(file)
          const keys = byLocale.get(locale) ?? new Set()
          for (const key of flattenKeys(parsed)) keys.add(key)
          byLocale.set(locale, keys)
          totalFiles++
        }

        if (byLocale.size < 2) continue

        // The union across locales is the expected key set: any key that exists
        // anywhere is one every locale owes a translation for.
        const union = new Set()
        for (const keys of byLocale.values()) {
          for (const key of keys) union.add(key)
        }
        totalKeys += union.size

        for (const [locale, keys] of byLocale) {
          const missing = [...union]
            .filter((key) => !keys.has(key))
            .sort((a, b) => a.localeCompare(b))
          if (missing.length > 0) problems.push({ dir: rel, locale, missing })
        }
      }

      if (problems.length > 0) {
        logger.error(
          'Locale files are out of parity. vue-i18n silently falls back to `en`, so these ' +
            'keys render as English (or as the raw key) in the affected language:',
        )
        for (const problem of problems) {
          if (problem.invalid) {
            logger.error(`- ${problem.dir}: invalid JSON — ${problem.invalid}`)
            continue
          }
          // Name both files. The overrides one is usually the right place —
          // sending someone to edit the upstream catalog is how a project ends
          // up with a locale file an upgrade cannot replace.
          logger.error(
            `- locale "${problem.locale}" in ${problem.dir} is missing ${problem.missing.length} key(s). ` +
              `Add them to ${problem.locale}.overrides.json (yours) or ${problem.locale}.json (Vuestrata's):`,
          )
          for (const key of problem.missing.slice(0, MAX_REPORTED)) {
            logger.error(`    ${key}`)
          }
          if (problem.missing.length > MAX_REPORTED) {
            logger.error(`    … and ${problem.missing.length - MAX_REPORTED} more`)
          }
        }
        return {
          ok: false,
          message: `${problems.length} locale file(s) out of parity`,
        }
      }

      logger.success(
        `Locale parity holds across ${dirs.length} folder(s), ${totalFiles} file(s), ${totalKeys} key(s).`,
      )
      return { ok: true }
    },
  }
}

/**
 * The locale a file contributes to: `fr.json` and `fr.overrides.json` both
 * answer `fr`.
 */
function localeOf(file) {
  return file.replace(/(\.overrides)?\.json$/, '')
}

/** The shell catalog plus every module that ships an `i18n/` folder. */
function collectLocaleDirs(root) {
  const dirs = []

  const shell = path.join(root, SHELL_LOCALES_DIR)
  if (fs.existsSync(shell)) dirs.push(shell)

  const modulesRoot = path.join(root, MODULES_DIR)
  if (!fs.existsSync(modulesRoot)) return dirs

  for (const entry of fs.readdirSync(modulesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const candidate = path.join(modulesRoot, entry.name, MODULE_LOCALES_SUBDIR)
    if (fs.existsSync(candidate)) dirs.push(candidate)
  }

  return dirs
}

/**
 * Flatten to dotted paths so a key nested in one locale and flat in another is
 * reported rather than silently compared as equal. Arrays are treated as leaves
 * — order and length are a translator's concern, not a parity one.
 */
function flattenKeys(value, prefix = '', acc = new Set()) {
  for (const [key, child] of Object.entries(value)) {
    const full = prefix ? `${prefix}.${key}` : key
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      flattenKeys(child, full, acc)
    } else {
      acc.add(full)
    }
  }
  return acc
}
