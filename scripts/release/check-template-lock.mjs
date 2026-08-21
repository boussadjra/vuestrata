import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { readLock } from '../../packages/cli/src/lib/lockfile.mjs'
import { collectManaged, SEEDED_FILES } from '../../packages/cli/src/lib/managed.mjs'
import { hashContents } from '../../packages/cli/src/lib/plan.mjs'

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
 * Rebuild with `vuestrata init --force --pristine`.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const LOCKFILE = 'vuestrata.lock.json'

function fail(problems) {
  console.error(`[template-lock] ${LOCKFILE} is out of date:`)
  for (const problem of problems.slice(0, 20)) console.error(`  - ${problem}`)
  if (problems.length > 20) console.error(`  … and ${problems.length - 20} more`)
  console.error('')
  console.error('  Rebuild it:  node packages/cli/src/index.mjs init --force --pristine')
  process.exit(1)
}

const lockPath = path.join(repoRoot, LOCKFILE)
if (!fs.existsSync(lockPath)) {
  fail([`${LOCKFILE} is missing.`])
}

const version = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version
const lock = readLock(repoRoot)
const problems = []

if (lock.template !== version) {
  problems.push(`records template ${lock.template}, but this repository is ${version}`)
}

const managed = collectManaged(repoRoot)
const tracked = new Set(Object.keys(lock.files))

for (const rel of managed) {
  const record = lock.files[rel]
  if (!record) {
    problems.push(`${rel} is managed but not tracked`)
    continue
  }
  const actual = hashContents(fs.readFileSync(path.join(repoRoot, rel), 'utf8'))
  if (record.hash !== actual) problems.push(`${rel} has changed since it was recorded`)
  tracked.delete(rel)
}

for (const rel of SEEDED_FILES) {
  if (!fs.existsSync(path.join(repoRoot, rel))) continue
  if (!lock.files[rel]) problems.push(`${rel} is a seam but not tracked`)
  tracked.delete(rel)
}

// Anything left is tracked but no longer part of the template — a file that was
// deleted or reclassified, which an upgrade would still try to reason about.
for (const rel of tracked) problems.push(`${rel} is tracked but no longer managed`)

if (problems.length > 0) fail(problems)

console.log(`[template-lock] ${LOCKFILE} matches ${managed.length} managed file(s) at ${version}.`)
