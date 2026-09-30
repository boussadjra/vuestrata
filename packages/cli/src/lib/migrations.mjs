import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { hashFor } from './lockfile.mjs'
import { DEFAULT_SLOTS, slot } from './manifest.mjs'
import { spliceRegions } from './registry.mjs'
import { incomingPath } from './workspace.mjs'

/**
 * Codemods that run between two versions.
 *
 * The release rule these serve is in RELEASE.md: no breaking change ships
 * without one.
 *
 * A migration is data, not a script — a list of idempotent steps resolving
 * their targets through the manifest. Being data is what lets `diff` show
 * exactly what `upgrade` will do without running it twice.
 *
 * `migrations/<version>/index.mjs` default-exports `{ description, steps }`, or
 * an array of them when one release makes several changes that each deserve a
 * line of their own in the report. A step names its target by `file` (a path,
 * or a function of the manifest) or by `slot`, and is one of four kinds:
 *
 *   codemod (the default)   { file, apply(source, manifest), pending?, note?, incoming? }
 *     Rewrites the file. Without `pending`, `apply` must be idempotent, and
 *     returning the source unchanged means there was nothing to do. With it the
 *     step is guarded: it runs only while `pending(source)` holds, and `apply`
 *     changes all of what it recognises or none of it. If `pending` still holds
 *     afterwards, the file is not in a shape the codemod knows, so it was left
 *     alone: `note` says what to do by hand, and `incoming` (contents, or a
 *     function of the source) is left at .vuestrata/incoming/<file> to do it
 *     against.
 *
 *   note                    { note, file?, pending? }
 *     Nothing automatic. Shown on every upgrade that crosses this version — or,
 *     given a `file`, only while `pending(source)` holds for it.
 *
 *   promote                 { file, pristine: [hash, ...], note?, unit? }
 *     A file the project owned becomes Vuestrata's. Adopted when its hash is in
 *     `pristine` — what it hashed to in the releases that shipped it — or
 *     already matches this release; the sync then keeps it updated. Otherwise it
 *     was edited: it stays as it is, this release's version goes to
 *     .vuestrata/incoming/, and the note says to merge it and run
 *     `vuestrata adopt`. A file the project moved elsewhere is never adopted:
 *     it gets the same copy and note, and its shipped path is recorded as
 *     ejected so no later release installs a second copy there.
 *
 *     Files that only work together carry the same `unit` name and move as one.
 *     If any file of a unit that the project has is edited, none is adopted and
 *     each gets its incoming copy, and only the first of them says so — put the
 *     note that covers the whole unit on that one.
 *
 *   reclassify              { file, to = 'merged', pristine?: [hash, ...], note? }
 *     A tracked managed file becomes merged. Its record's whole-file hash counts
 *     as clean this once, and so does any `pristine` hash, computed the merged
 *     way (app: regions blanked): either way the record is rewritten as merged
 *     and never consulted the old way again. An edited file keeps its old record
 *     and gets the note. Merged is the only destination: a merged file judged
 *     clean may hold the project's app: entries, and a record demoted to
 *     managed would let the sync replace the file without them. A release that
 *     drops a file's app: regions needs no step — the sync offers it in
 *     .vuestrata/incoming/ with the stranded entries named.
 *
 * Any step targeting a file may carry `pending(source)`; while it returns false,
 * the step has nothing to do there.
 *
 * Codemods and notes run first, in version order, then the ownership steps:
 * those judge a file by its hash, so they see it after every codemod has had
 * its turn. `scripts/pristine-hashes.mjs` prints the hashes a `pristine` list
 * needs, read from the release tags.
 */

const here = path.dirname(fileURLToPath(import.meta.url))

export const STEP_KINDS = ['codemod', 'note', 'promote', 'reclassify']

export function migrationsRoot() {
  return path.resolve(here, '../../migrations')
}

/**
 * Whether the migration for `version` belongs to an upgrade from `from` to `to`.
 *
 * Exclusive at the bottom and inclusive at the top: a project already at 1.1.0
 * has had 1.1.0's migration applied, and one moving to 1.2.0 needs 1.2.0's.
 *
 * The top is compared against `to`'s release core. A migration is written for
 * the release it ships in, and every prerelease on the way to that release
 * carries it: moving to 1.2.0-alpha.0 must run 1.2.0's migration, or an alpha
 * project never gets the codemods its own release depends on. Moving on to
 * 1.2.0-alpha.1 runs it again, since 1.2.0-alpha.0 < 1.2.0. That is safe
 * because every step is idempotent, and it is needed because the migration can
 * gain steps between two alphas — which is also why the lock keeps no record of
 * applied migrations: one saying "1.2.0 done" after alpha.0 would skip whatever
 * alpha.1 added.
 */
export function inMigrationRange(version, from, to) {
  return compareVersions(version, from) > 0 && compareVersions(version, releaseCore(to)) <= 0
}

/** `1.2.0-alpha.3` → `1.2.0`. */
export function releaseCore(version) {
  return String(version).split(/[-+]/)[0]
}

/** The migrations in `(from, to]`, oldest first, in file order within a version. */
export function selectMigrations(migrations, from, to) {
  return migrations
    .filter((migration) => inMigrationRange(migration.version, from, to))
    .sort((a, b) => compareVersions(a.version, b.version))
}

/** Every migration in `(from, to]`, oldest first, loaded from disk. */
export async function collectMigrationsAsync(from, to) {
  const root = migrationsRoot()
  if (!fs.existsSync(root)) return []

  const versions = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+\.\d+\.\d+/.test(entry.name))
    .map((entry) => entry.name)
    .filter((version) => inMigrationRange(version, from, to))
    .sort(compareVersions)

  const loaded = []
  for (const version of versions) {
    const module = await import(pathToUrl(path.join(root, version, 'index.mjs')))
    const groups = Array.isArray(module.default) ? module.default : [module.default]

    for (const group of groups) {
      const migration = { version, description: group.description, steps: group.steps ?? [] }
      validateMigration(migration)
      loaded.push(migration)
    }
  }
  return loaded
}

/**
 * Synchronous wrapper. `index.mjs` loads migrations eagerly so `diff` and
 * `upgrade` can share one non-async traversal rather than growing two.
 */
export function collectMigrations(from, to) {
  return selectMigrations(LOADED, from, to)
}

/** Populated once by `loadAllMigrations()` before any command runs. */
let LOADED = []

export async function loadAllMigrations() {
  LOADED = await collectMigrationsAsync('0.0.0', '999.999.999')
  return LOADED
}

/**
 * Throw on a step no upgrade could run. Checked when a migration loads, so a
 * malformed one fails before anything is planned rather than halfway through.
 */
export function validateMigration(migration) {
  const where = `migration ${migration.version}`
  if (typeof migration.description !== 'string') throw new Error(`${where} has no description`)
  if (!Array.isArray(migration.steps)) throw new Error(`${where}: steps must be an array`)

  migration.steps.forEach((step, index) => {
    const kind = step.kind ?? 'codemod'
    const label = `${where}, step ${index + 1} (${kind})`

    if (!STEP_KINDS.includes(kind)) {
      throw new Error(`${label}: unknown kind. Known: ${STEP_KINDS.join(', ')}`)
    }

    const targeted = step.file !== undefined || step.slot !== undefined
    if (kind !== 'note' && !targeted) throw new Error(`${label} names no file or slot`)
    if (kind === 'codemod' && typeof step.apply !== 'function') {
      throw new Error(`${label} has no apply(source, manifest)`)
    }
    if (kind === 'note' && typeof step.note !== 'string') throw new Error(`${label} has no note`)
    if (kind === 'promote' && !Array.isArray(step.pristine)) {
      throw new Error(`${label} has no pristine hash list`)
    }
    if (kind === 'reclassify' && (step.to ?? 'merged') !== 'merged') {
      throw new Error(
        `${label}: \`to\` can only be merged. Demoting a merged file would let the next sync ` +
          "replace it without the project's app: entries.",
      )
    }
    if (step.unit !== undefined && (kind !== 'promote' || typeof step.unit !== 'string')) {
      throw new Error(`${label}: unit is a name that promote steps share`)
    }
    if (step.pending !== undefined && typeof step.pending !== 'function') {
      throw new Error(`${label}: pending must be a function of the source`)
    }
  })
}

/**
 * Run `migrations` against a workspace. File changes go to `ws` and ownership
 * changes to `lock`, both in memory — the caller decides whether to write them.
 *
 * `handled` lists paths a promotion dealt with completely, so the payload sync
 * does not report them a second time.
 */
export function applyMigrations({ migrations, ws, lock, manifest, source, version }) {
  const result = { applied: [], adopted: [], incoming: [], notes: [], handled: new Set() }
  const context = { ws, lock, manifest, source, version, result }

  for (const migration of migrations) {
    const applied = { version: migration.version, description: migration.description, changed: [] }

    for (const step of migration.steps) {
      const kind = step.kind ?? 'codemod'
      if (kind === 'codemod') runCodemod(step, migration, applied, context)
      if (kind === 'note') runNote(step, migration, context)
    }

    result.applied.push(applied)
  }

  for (const migration of migrations) {
    for (const step of migration.steps) {
      if (step.kind === 'promote') runPromote(step, migration, context)
      if (step.kind === 'reclassify') runReclassify(step, migration, context)
    }
  }

  return result
}

/** Resolve a step's target in `manifest`. */
export function stepTarget(step, manifest) {
  if (step.slot !== undefined) return slot(manifest, step.slot)
  return typeof step.file === 'function' ? step.file(manifest) : step.file
}

function runCodemod(step, migration, applied, { ws, manifest, result }) {
  const rel = stepTarget(step, manifest)
  if (!ws.exists(rel)) return

  const before = ws.read(rel)
  if (step.pending && !step.pending(before, manifest)) return

  const after = step.apply(before, manifest)
  if (after !== before) {
    ws.write(rel, after)
    applied.changed.push(rel)
  }

  if (!step.pending?.(after, manifest)) return

  // Still pending: the guard did not recognise the file, so it was left alone.
  if (step.incoming !== undefined) {
    const contents =
      typeof step.incoming === 'function' ? step.incoming(before, manifest) : step.incoming
    ws.write(incomingPath(rel), contents)
    result.incoming.push({
      rel,
      incoming: incomingPath(rel),
      reason: `migration ${migration.version}`,
    })
  }

  result.notes.push({
    version: migration.version,
    rel,
    text:
      step.note ??
      `${rel} was not in a shape the ${migration.version} migration recognises, so it was left ` +
        `alone (${migration.description}). Make that change by hand.`,
  })
}

function runNote(step, migration, { ws, manifest, result }) {
  let rel

  if (step.file !== undefined || step.slot !== undefined) {
    rel = stepTarget(step, manifest)
    if (!ws.exists(rel)) return
    if (step.pending && !step.pending(ws.read(rel), manifest)) return
  }

  result.notes.push({ version: migration.version, rel, text: step.note })
}

/**
 * What a promote step would do to the project's copy, or `null` when there is
 * nothing to do: the file is ejected or already tracked, this release does not
 * ship it, the project has none, or the step's `pending` says it is done.
 */
function inspectPromote(step, { ws, lock, manifest, source }) {
  const rel = stepTarget(step, manifest)
  // Where the release ships it, which is where the payload sync looks for it.
  const shipped = stepTarget(step, { ...manifest, slots: DEFAULT_SLOTS })

  if (lock.ejected.includes(rel) || lock.ejected.includes(shipped)) return null
  if (lock.files[rel] || lock.files[shipped]) return null // already tracked: done on an earlier run
  if (!source?.files || !Object.hasOwn(source.files, shipped)) return null // not in this release
  if (!ws.exists(rel)) return null // nothing to adopt; the sync installs it as new

  const current = ws.read(rel)
  if (step.pending && !step.pending(current, manifest)) return null

  // The release decides the class: it ships the file in `files`, so managed
  // unless it also lists it as merged.
  const cls = source.classOf(shipped) === 'merged' ? 'merged' : 'managed'
  const hash = hashFor(rel, current, cls)
  const incoming = source.has(shipped) ? source.read(shipped) : undefined

  const pristine =
    step.pristine.includes(hash) ||
    (incoming !== undefined && hash === hashFor(shipped, incoming, cls))

  return { step, rel, shipped, current, cls, hash, incoming, pristine, moved: rel !== shipped }
}

function runPromote(step, migration, context) {
  const { ws, lock, version, result } = context
  const found = inspectPromote(step, context)
  if (!found) return
  const { rel, shipped, current, cls, hash, incoming, moved } = found

  // A unit moves whole. Judge every member the project has: one edited copy
  // holds the rest back, since each is written against the others.
  let adoptable = found.pristine && !moved
  let speaks = true
  if (step.unit !== undefined) {
    const members = migration.steps
      .filter((other) => other.kind === 'promote' && other.unit === step.unit)
      .map((other) => (other === step ? found : inspectPromote(other, context)))
      .filter(Boolean)
    if (members.some((member) => !member.pristine || member.moved)) adoptable = false
    speaks = members[0]?.step === step
  }

  if (adoptable) {
    lock.files[rel] = { class: cls, hash, since: version }
    result.adopted.push({ rel, class: cls, reason: 'promoted' })
    return
  }

  // Edited, moved, or held back by a member of its unit: either way not
  // Vuestrata's to replace. The new version goes beside the project's copy,
  // under the path the project uses.
  if (incoming !== undefined) {
    const copy = cls === 'merged' ? spliceRegions(incoming, current).contents : incoming
    ws.write(incomingPath(rel), copy)
    result.incoming.push({
      rel,
      incoming: incomingPath(rel),
      reason: moved ? `promoted, moved from ${shipped}` : 'promoted',
      ...(moved && { shipped }),
    })
  }
  result.handled.add(shipped)

  // The project chose where this file lives, and upgrades only track a managed
  // file where it ships. Once this migration is out of range nothing else says
  // so, and the sync would install the release's copy at the shipped path — a
  // second one. Ejecting that path is the record that it stays empty.
  if (moved) lock.ejected.push(shipped)

  if (!speaks) return

  result.notes.push({
    version: migration.version,
    rel,
    text:
      step.note ??
      (moved
        ? `${shipped} is maintained by Vuestrata from ${migration.version}, but this project keeps ` +
          `it at ${rel}, and upgrades only track a managed file where it ships. Yours was left ` +
          `alone; compare it with ${incomingPath(rel)}. ${shipped} is now recorded as ejected, so ` +
          `no release installs a second copy there, and later releases will not offer this file ` +
          `again. To have upgrades keep it updated, move it back to ${shipped}, update ` +
          `vuestrata.config.json to match, and run \`vuestrata adopt ${shipped}\`.`
        : `${rel} is maintained by Vuestrata from ${migration.version}, but this copy differs from ` +
          `every release that shipped it, so it was left alone. Merge what you want from ` +
          `${incomingPath(rel)}, then run \`vuestrata adopt ${rel}\` so later releases can update it.`),
  })
}

function runReclassify(step, migration, { ws, lock, manifest, result }) {
  const rel = stepTarget(step, manifest)
  const record = lock.files[rel]

  // Only a managed record moves: seeded is the project's, and merged is done.
  if (record?.class !== 'managed') return
  if (!ws.exists(rel)) return // deleted here; the sync reports it

  const current = ws.read(rel)
  if (step.pending && !step.pending(current, manifest)) return

  const hash = hashFor(rel, current, 'merged')
  const legacyClean = hashFor(rel, current, 'managed') === record.hash

  if (legacyClean || (step.pristine ?? []).includes(hash)) {
    lock.files[rel] = { ...record, class: 'merged', hash }
    result.adopted.push({ rel, class: 'merged', reason: 'reclassified' })
    return
  }

  result.notes.push({
    version: migration.version,
    rel,
    text:
      step.note ??
      `${rel} becomes a merged file in ${migration.version}, but it was edited outside its ` +
        `app: regions, so it keeps its old record and the new version goes to ` +
        `${incomingPath(rel)}. Merge what you want, then run \`vuestrata adopt ${rel}\`.`,
  })
}

function pathToUrl(file) {
  return new URL(`file://${file.replaceAll('\\', '/').replace(/^([A-Za-z]):/, '/$1:')}`).href
}

/**
 * Compare two semver strings, treating a prerelease as older than its release.
 * Small on purpose: Vuestrata's own versions are the only input. Prerelease
 * identifiers compare numerically where they are numbers, so alpha.10 comes
 * after alpha.9.
 */
export function compareVersions(a, b) {
  const parse = (value) => {
    const text = String(value).split('+')[0]
    const dash = text.indexOf('-')
    const core = dash === -1 ? text : text.slice(0, dash)
    const pre = dash === -1 ? undefined : text.slice(dash + 1)
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
  return comparePrerelease(left.pre, right.pre)
}

function comparePrerelease(a, b) {
  const left = a.split('.')
  const right = b.split('.')

  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if (left[i] === undefined) return -1
    if (right[i] === undefined) return 1
    if (left[i] === right[i]) continue

    const leftNumeric = /^\d+$/.test(left[i])
    const rightNumeric = /^\d+$/.test(right[i])
    if (leftNumeric && rightNumeric) return Number(left[i]) < Number(right[i]) ? -1 : 1
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1
    return left[i] < right[i] ? -1 : 1
  }

  return 0
}
