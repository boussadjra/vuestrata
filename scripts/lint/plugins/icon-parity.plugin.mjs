import fs from 'node:fs'
import path from 'node:path'

/**
 * Every icon provider must implement every semantic icon name.
 *
 * `IconName` in `src/modules/app/types/index.ts` is the allowlist; each map in
 * `src/modules/app/icons/maps/` is typed `IconMap` (= `Record<IconName, string>`),
 * so in principle the compiler already enforces this.
 *
 * In practice it only catches a *missing* key. It does not catch:
 *   - an entry whose value is an empty string, which renders nothing at all;
 *   - a name added to the union with no map updated, if the maps are edited
 *     later in the same change and the error is dismissed as transient;
 *   - a stale hand-maintained duplicate of the union living in another file.
 *
 * That last case is not hypothetical. `icons/maps/custom.ts` used to carry a
 * literal `ICON_NAMES` array that had fallen nine names behind the union, so
 * `createCustomIconMap` silently refused to seed those slots for anyone
 * building a third-party set. It now derives the list instead, and this rule
 * exists so the class of failure cannot come back in another shape.
 *
 * Icon values are not validated against the installed Iconify packs — a typo'd
 * `i-solar-bolt-bolder` is a real gap this rule does not close. Doing so means
 * resolving `@iconify-json/*` at lint time; worth adding if it ever bites.
 */

const TYPES_FILE = 'src/modules/app/types/index.ts'
const MAPS_DIR = 'src/modules/app/icons/maps'

/** `custom.ts` is a factory, not a complete map — skip it when scanning. */
const SKIP_MAPS = new Set(['custom.ts'])

function discoverMapFiles(root) {
  const dir = path.join(root, MAPS_DIR)
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.ts') && !SKIP_MAPS.has(file))
    .sort((a, b) => a.localeCompare(b))
}

export function iconParityPlugin() {
  return {
    name: 'icon-parity',
    check({ root, logger }) {
      const typesPath = path.join(root, TYPES_FILE)
      if (!fs.existsSync(typesPath)) {
        logger.error(`Cannot find ${TYPES_FILE} — icon-parity has nothing to check against.`)
        return { ok: false, message: 'icon-parity: types file missing' }
      }

      const union = parseIconNameUnion(fs.readFileSync(typesPath, 'utf8'))
      if (union.size === 0) {
        logger.error(
          `Could not parse the \`IconName\` union out of ${TYPES_FILE}. ` +
            'If its shape changed, update scripts/lint/plugins/icon-parity.plugin.mjs to match.',
        )
        return { ok: false, message: 'icon-parity: could not parse IconName' }
      }

      const mapFiles = discoverMapFiles(root)
      if (mapFiles.length === 0) {
        logger.error(`No icon maps found in ${MAPS_DIR}/ (other than custom.ts).`)
        return { ok: false, message: 'icon-parity: no maps to check' }
      }

      const problems = []

      for (const mapFile of mapFiles) {
        const mapPath = path.join(root, MAPS_DIR, mapFile)
        const rel = `${MAPS_DIR}/${mapFile}`

        if (!fs.existsSync(mapPath)) {
          problems.push({ file: rel, fatal: 'file does not exist' })
          continue
        }

        const entries = parseIconMapEntries(fs.readFileSync(mapPath, 'utf8'))
        const missing = [...union]
          .filter((name) => !entries.has(name))
          .sort((a, b) => a.localeCompare(b))
        const extra = [...entries.keys()]
          .filter((name) => !union.has(name))
          .sort((a, b) => a.localeCompare(b))
        const empty = [...entries].filter(([, value]) => value.trim() === '').map(([name]) => name)

        if (missing.length || extra.length || empty.length) {
          problems.push({ file: rel, missing, extra, empty })
        }
      }

      if (problems.length > 0) {
        logger.error(
          'Icon maps are out of sync with the `IconName` union. A name missing from a ' +
            'provider renders as an empty span — no error, no fallback, just a gap in the UI.',
        )
        for (const problem of problems) {
          if (problem.fatal) {
            logger.error(`- ${problem.file}: ${problem.fatal}`)
            continue
          }
          if (problem.missing?.length) {
            logger.error(`- ${problem.file} is missing: ${problem.missing.join(', ')}`)
          }
          if (problem.extra?.length) {
            logger.error(
              `- ${problem.file} defines names absent from IconName: ${problem.extra.join(', ')}`,
            )
          }
          if (problem.empty?.length) {
            logger.error(`- ${problem.file} has empty values for: ${problem.empty.join(', ')}`)
          }
        }
        logger.error(
          `Add the name to every map in ${MAPS_DIR}/, or remove it from IconName in ${TYPES_FILE}.`,
        )
        return { ok: false, message: `${problems.length} icon map(s) out of sync` }
      }

      logger.success(
        `Icon parity holds: ${union.size} name(s) across ${mapFiles.length} provider(s).`,
      )
      return { ok: true }
    },
  }
}

/**
 * Pull the string-literal members out of:
 *
 *   export type IconName =
 *     | 'bolt'
 *     | 'shield-check'
 *
 * Stops at the first blank line followed by a non-`|` statement, so it reads
 * only this union and not the ones after it.
 */
function parseIconNameUnion(source) {
  const names = new Set()
  const start = source.indexOf('export type IconName')
  if (start === -1) return names

  const lines = source.slice(start).split(/\r?\n/)
  // Skip the declaration line itself, then consume the `| 'name'` members.
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line === '') continue
    const match = line.match(/^\|\s*'([^']+)'/)
    if (match) {
      names.add(match[1])
      continue
    }
    // Anything that is not a union member ends the declaration.
    break
  }

  return names
}

/**
 * Read `key: 'value'` pairs from an `IconMap` object literal. Keys may be bare
 * (`bolt:`) or quoted (`'shield-check':`) depending on whether they are valid
 * identifiers — both forms appear in these files.
 */
function parseIconMapEntries(source) {
  const entries = new Map()
  const pattern = /(?:^|\n)\s*(?:'([^']+)'|([A-Za-z_$][\w$]*))\s*:\s*'([^']*)'/g

  let match
  while ((match = pattern.exec(source)) !== null) {
    const key = match[1] ?? match[2]
    entries.set(key, match[3])
  }

  return entries
}
