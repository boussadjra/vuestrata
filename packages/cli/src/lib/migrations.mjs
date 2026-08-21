import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Codemods that run between two versions.
 *
 * The release rule these serve is in RELEASE.md: no breaking change ships
 * without one.
 *
 * A migration is data, not a script — a list of idempotent `{ file, apply }`
 * steps resolving their targets through the manifest. Being data is what lets
 * `diff` show exactly what `upgrade` will do without running it twice.
 */

const here = path.dirname(fileURLToPath(import.meta.url))

export function migrationsRoot() {
  return path.resolve(here, '../../migrations')
}

/**
 * Every migration in `(from, to]`, oldest first.
 *
 * Exclusive at the bottom and inclusive at the top: a project already at 1.1.0
 * has had 1.1.0's migration applied, and one moving to 1.2.0 needs 1.2.0's.
 */
export async function collectMigrationsAsync(from, to) {
  const root = migrationsRoot()
  if (!fs.existsSync(root)) return []

  const versions = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+\.\d+\.\d+/.test(entry.name))
    .map((entry) => entry.name)
    .filter((version) => compareVersions(version, from) > 0 && compareVersions(version, to) <= 0)
    .sort(compareVersions)

  const loaded = []
  for (const version of versions) {
    const module = await import(pathToUrl(path.join(root, version, 'index.mjs')))
    const migration = module.default
    loaded.push({ version, description: migration.description, steps: migration.steps })
  }
  return loaded
}

/**
 * Synchronous wrapper. `index.mjs` loads migrations eagerly so `diff` and
 * `upgrade` can share one non-async traversal rather than growing two.
 */
export function collectMigrations(from, to) {
  return LOADED.filter(
    (migration) =>
      compareVersions(migration.version, from) > 0 && compareVersions(migration.version, to) <= 0,
  ).sort((a, b) => compareVersions(a.version, b.version))
}

/** Populated once by `loadAllMigrations()` before any command runs. */
let LOADED = []

export async function loadAllMigrations() {
  LOADED = await collectMigrationsAsync('0.0.0', '999.999.999')
  return LOADED
}

function pathToUrl(file) {
  return new URL(`file://${file.replaceAll('\\', '/').replace(/^([A-Za-z]):/, '/$1:')}`).href
}

/**
 * Compare two semver strings, treating a prerelease as older than its release.
 * Small on purpose: Vuestrata's own versions are the only input.
 */
export function compareVersions(a, b) {
  const parse = (value) => {
    const [core, pre] = String(value).split('-')
    const parts = core.split('.').map((n) => Number.parseInt(n, 10) || 0)
    return { parts, pre }
  }

  const left = parse(a)
  const right = parse(b)

  for (let i = 0; i < 3; i++) {
    const diff = (left.parts[i] ?? 0) - (right.parts[i] ?? 0)
    if (diff !== 0) return diff < 0 ? -1 : 1
  }

  if (left.pre === right.pre) return 0
  if (left.pre === undefined) return 1
  if (right.pre === undefined) return -1
  return left.pre < right.pre ? -1 : 1
}
