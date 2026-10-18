import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { hashFor, readLock, regionHash } from '../../packages/cli/src/lib/lockfile.mjs'
import {
  classify,
  collectDocs,
  collectManaged,
  collectSeeded,
  PROJECT_REGISTRIES,
} from '../../packages/cli/src/lib/managed.mjs'
import { loadManifest, slot } from '../../packages/cli/src/lib/manifest.mjs'
import {
  regionEntries,
  regionLines,
  sentinel,
  UPSTREAM_SCOPE,
} from '../../packages/cli/src/lib/registry.mjs'

/**
 * Is the committed `vuestrata.lock.json` still true?
 *
 * The template ships a lockfile so a project that clones it starts already
 * tracked — without one, an edit made before `vuestrata init` gets baselined as
 * pristine and is silently replaced by the first upgrade.
 *
 * But a shipped lockfile is a claim about this release, and it goes stale the
 * moment a managed file changes without it being rebuilt. Then every consumer
 * who clones sees files they never touched reported as locally modified, and
 * stops receiving updates for exactly those files. Nothing errors; the updates
 * just quietly stop arriving.
 *
 * So it is checked like the toolchain pins and the security headers are.
 *
 * FOR TEMPLATE MAINTAINERS. Run through `vpr lint:maintainer`, never through
 * a project's `vpr lint`: a project bumps its own version, edits managed files
 * and generates seeded ones as a matter of course, and every one of those would
 * fail here. A project's equivalent is `vuestrata doctor`.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const LOCKFILE = 'vuestrata.lock.json'

function fail(problems) {
  console.error(`[template-lock] ${LOCKFILE} is out of date:`)
  for (const problem of problems.slice(0, 20)) console.error(`  - ${problem}`)
  if (problems.length > 20) console.error(`  … and ${problems.length - 20} more`)
  console.error('')
  console.error('  This gate is for template maintainers. It checks the lockfile this repository')
  console.error('  ships, so it goes stale when a managed file changes without it being rebuilt.')
  console.error('  Maintainers rebuild it with:')
  console.error('    node packages/cli/src/index.mjs init --force --pristine --no-format')
  console.error('')
  console.error('  In a project built from the template, do NOT do that: it records your edits as')
  console.error('  the upstream copy, and the next upgrade then replaces them. Run')
  console.error('  `vuestrata doctor` instead, which reports drift without changing anything.')
  process.exit(1)
}

/**
 * Everything in `lock` that is not true of the template at `root`, as one line
 * each. Empty when the lockfile can ship.
 *
 * Takes the lock as a value so a test can ask about one that differs from the
 * committed file in a single respect.
 *
 * @param {{ root?: string, lock?: ReturnType<typeof readLock>, version?: string }} [options]
 * @returns {{ problems: string[], managed: string[] }}
 */
export function templateLockProblems({
  root = repoRoot,
  lock = readLock(root),
  version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version,
} = {}) {
  const problems = []

  if (lock.template !== version) {
    problems.push(`records template ${lock.template}, but this repository is ${version}`)
  }

  const managed = collectManaged(root)
  const tracked = new Set(Object.keys(lock.files))

  for (const rel of managed) {
    const record = lock.files[rel]
    if (!record) {
      problems.push(`${rel} is managed but not tracked`)
      continue
    }
    tracked.delete(rel)

    // A merged file is hashed with its app: regions blanked; recorded as managed
    // it would read as edited the moment a project generated anything into it.
    const cls = classify(rel)
    if (record.class === 'seeded') {
      // Deliberately strict, including for a component or theme `vuestrata add`
      // generated into a managed directory. In a project such a record is right:
      // the file is the project's. Here it is not, because this is the template:
      // the payload ships every file under a managed directory, so this one goes
      // out as Vuestrata's while the lockfile a clone starts with calls it the
      // project's, and no upgrade would ever update it there. Either the file is
      // not meant to ship and should not be committed, or it is and its record
      // has to say so. `init --force` never takes a file back from a project, so
      // a rebuild cannot fix this one: the entry has to go by hand first.
      problems.push(
        `${rel} is recorded as seeded, but it is ${cls}. Delete its entry from ${LOCKFILE}, ` +
          'then rebuild',
      )
      continue
    }
    if (record.class !== cls) {
      problems.push(`${rel} is recorded as ${record.class}, but it is ${cls}`)
      continue
    }
    const actual = hashFor(rel, fs.readFileSync(path.join(root, rel), 'utf8'), cls)
    if (record.hash !== actual) problems.push(`${rel} has changed since it was recorded`)
  }

  for (const rel of collectSeeded(root)) {
    if (!lock.files[rel]) problems.push(`${rel} is a seam but not tracked`)
    tracked.delete(rel)
  }

  // Anything left is tracked but no longer part of the template — a file that was
  // deleted or reclassified, which an upgrade would still try to reason about.
  //
  // Except a seeded record. `add module|component|theme` writes the files it
  // generates as seeded and records each, so a lockfile that has seen one holds
  // entries for files that are not seams and never will be. They belong to the
  // project, and `upgrade` never touches them, so they are not stale. (One that
  // sits under a managed directory was reported above: here that file ships.)
  for (const rel of tracked) {
    if (lock.files[rel].class === 'seeded') continue
    problems.push(`${rel} is tracked but no longer managed`)
  }

  // The registries' vuestrata: regions are baselines too. A stale one makes a
  // fresh clone's first upgrade think the project edited the region, and skip it.
  const manifest = loadManifest(root)
  for (const registry of PROJECT_REGISTRIES) {
    const rel = slot(manifest, registry.slot)
    const name = sentinel(registry.region, UPSTREAM_SCOPE)
    const full = path.join(root, rel)
    const lines = fs.existsSync(full) ? regionLines(fs.readFileSync(full, 'utf8'), name) : undefined
    if (lines === undefined) continue // `doctor` and the payload build report missing markers

    const recorded = lock.regions[rel]?.[name]
    const actual = regionHash(regionEntries(lines, { keyedBy: registry.keyedBy }))
    if (recorded === undefined) problems.push(`${name} in ${rel} is not recorded`)
    else if (recorded !== actual) {
      problems.push(`${name} in ${rel} has changed since it was recorded`)
    }
  }

  // The `docs/` pages are listed, not hashed: `eject` removes the listed ones and
  // keeps the rest as the project's own. A page missing from the list would be
  // left behind in every project built from this release, under a note calling
  // it theirs.
  const docs = collectDocs(root)
  if (!lock.docs) {
    problems.push('the docs/ pages are not listed')
  } else {
    for (const rel of docs) {
      if (!lock.docs.includes(rel)) problems.push(`${rel} is a docs page but not listed`)
    }
    for (const rel of lock.docs) {
      if (!docs.includes(rel)) problems.push(`${rel} is listed as a docs page but does not exist`)
    }
  }

  return { problems, managed }
}

function main() {
  if (!fs.existsSync(path.join(repoRoot, LOCKFILE))) fail([`${LOCKFILE} is missing.`])

  const version = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version
  const { problems, managed } = templateLockProblems({ version })
  if (problems.length > 0) fail(problems)

  console.log(
    `[template-lock] ${LOCKFILE} matches ${managed.length} managed or merged file(s) and ` +
      `${PROJECT_REGISTRIES.length} registry region(s) at ${version}.`,
  )
}

/**
 * Whether Node was asked to run this file, rather than a test importing it for
 * `templateLockProblems`. Compared by real path, so a symlinked checkout cannot
 * turn the gate into a silent no-op.
 */
function isEntryPoint(argv1) {
  if (!argv1) return false
  try {
    const real = (file) => fs.realpathSync(file).toLowerCase()
    return real(path.resolve(argv1)) === real(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isEntryPoint(process.argv[1])) main()
