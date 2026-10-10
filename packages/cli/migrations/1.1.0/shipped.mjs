import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { hashContents } from '../../src/lib/plan.mjs'
import { inEolOf, toLf } from './text.mjs'

/**
 * The project's own files that 1.1.0 replaces when nobody has edited them.
 *
 * The payload carries what Vuestrata manages, and none of these is managed:
 * the Dockerfile, the CI workflow and the rest are the project's. But a project
 * that never touched its copy should not keep the 1.0 one for ever, so the
 * migration replaces a copy whose hash a release produced, and offers the new
 * one beside any other in .vuestrata/incoming/.
 *
 * The copies it writes are in `shipped/`, one file per path with `.txt` added,
 * so that no formatter, linter, test runner or build picks them up as source.
 * Each is this repository's file as 1.1.0 ships it, which a maintainer gate
 * checks (`vpr lint:maintainer`), so that the migration and a fresh clone
 * cannot drift apart:
 *
 *     node packages/cli/migrations/1.1.0/shipped.mjs --check
 *     node packages/cli/migrations/1.1.0/shipped.mjs --write    # refresh them
 *
 * WHEN A LATER 1.1.0 PRERELEASE CHANGES ONE OF THESE FILES: refresh the copy,
 * and add the hash the file had in the previous prerelease to its `pristine`
 * list below (`node packages/cli/scripts/pristine-hashes.mjs --tags <tag>
 * --class managed <path> --json`). Otherwise a project that took the earlier
 * prerelease keeps that copy, because the step no longer recognises it as one
 * a release shipped.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const SHIPPED_DIR = path.join(here, 'shipped')

/**
 * Path → what the file hashed to in every release that shipped it before this
 * one. The same at 1.0.1-alpha.5 and 1.0.1-alpha.6 for all of them.
 */
export const SHIPPED = {
  'src/modules/app/plugins/i18n.ts': [
    'sha256-d5eba11ebc490039b36eed673ad4b1a44403164cd9276dc1fd15b8b6712f5db4',
    'sha256-1f93bab2bf4a1060fbc8eb3a6113e94ace0a3367f818d5c5754d39115778045e',
  ],
  'src/modules/app/composables/useActiveLocale.ts': [
    'sha256-fb0150f770b3d890ea499cd73e24f4875e44a8762e11bc8f09119e8080a81835',
    'sha256-b4e6496a0219fdff431936f4d3edf764a1de473190c44adb936bd5cfd9fb5414',
  ],
  'src/modules/app/composables/useLocales.ts': [
    'sha256-203ce66e7af9550d5ce772b933ab21e249c88c0014002b34725ebb67773760e5',
  ],
  'src/modules/i18n.ts': [
    'sha256-36c37c188451f50b91135cf0eb6ffe85c053e9bc83725ce804000c41494ee7c3',
  ],
  'src/modules/index.ts': [
    'sha256-444fb60e299008d781c82f8e1e4899844d683f987ae188a621e125e235e8ca0b',
    'sha256-2ec980b65ed65ad7d1384fb2d48eb6954ce9c1301029e3a03a7145967eb0f384',
  ],
  Dockerfile: [
    'sha256-a8caa2c60d04f683c88eded52be1dabee7bef040f0b9da0b44ff30fff83a2e3e',
    'sha256-2ed5578db4a9a3f1669cfaf055822a52f81e8e777766653e35683581975c1d8d',
  ],
  'docker-compose.yml': ['sha256-5cd91c944945f00b13cabf370ac9909693c2e037bfe6556250da56edd7028a97'],
  '.dockerignore': ['sha256-01ef496e39e7a2110a2bccc7c5ab39822c368dc980f0590676065524a5fee38f'],
  '.github/dependabot.yml': [
    'sha256-9546e63bc0acaaed6ca23b5ebe76d482f4e920b3c3cfd2c7a404c93577dac5c5',
  ],
  '.github/workflows/ci.yml': [
    'sha256-ffbf5c1d51a040bf794d73d715254c3961185b603ecd4cff75927c1a1d1d69bc',
  ],
  'e2e/production-artifact.spec.ts': [
    'sha256-26b1fc8d8a1f74b29743d840bbcad90b03049fac41949881b9d7957bf884290b',
  ],
  'scripts/lint/check-toolchain-pins.mjs': [
    'sha256-f6f6fcbc3f9cfc6c7b3864fdbeb4974da883d36ca740909f1ef03c53187cadcb',
    'sha256-3ebe32bcde520a753c05dc80e0377ac58109bef3c4cc55b1a324dcaa955b31d5',
  ],
}

const shippedPath = (rel) => path.join(SHIPPED_DIR, `${rel}.txt`)

/** The file as this release ships it, in LF. */
export function shippedCopy(rel) {
  return toLf(fs.readFileSync(shippedPath(rel), 'utf8'))
}

/**
 * A guarded codemod that replaces the whole of `file` with this release's copy.
 *
 * Replaced only when its hash is one a release produced, in the line endings it
 * had. Any other copy is the project's work and stays, with the new version in
 * .vuestrata/incoming/.
 *
 * `carries(source)` says whether a copy already has what this release changed.
 * It is what makes the step quiet for a project that merged the change by hand,
 * and on the next prerelease. Without it every edited copy would be offered
 * again on every upgrade.
 *
 * `ready(ws)` holds a replacement back while something it depends on has not
 * arrived: the copy is still offered, and the note says why.
 */
export function replaceWithShipped({ file, carries, ready = () => true, note = false }) {
  const pristine = SHIPPED[file]
  if (!pristine) throw new Error(`${file} has no pristine list in shipped.mjs`)

  const isPristine = (source) => pristine.includes(hashContents(source))
  const isShipped = (source) => hashContents(source) === hashContents(shippedCopy(file))

  return {
    file,
    pending: (source) => !isShipped(source) && (isPristine(source) || !carries(source)),
    apply: (source, manifest, ws) =>
      isPristine(source) && ready(ws) ? inEolOf(source, shippedCopy(file)) : source,
    incoming: () => shippedCopy(file),
    note,
    /** For the note that speaks for a family: why this copy was left. */
    wasPristine: isPristine,
  }
}

/**
 * The files of `steps` that this upgrade leaves as they are although the step
 * still has something to deliver. Right before the steps ran and after: a
 * replaced file is no longer pending, and a file left alone is as it was.
 */
export function heldBack(steps, manifest, ws) {
  return steps.filter((step) => {
    if (!ws.exists(step.file)) return false
    const source = ws.read(step.file)
    return step.pending(source, manifest, ws) && step.apply(source, manifest, ws) === source
  })
}

// ─── Maintainer check ────────────────────────────────────────────────────────

/** Compare the copies with the repository, or with `write`, refresh them. */
export function checkShipped({ repoRoot = path.resolve(here, '../../../..'), write = false } = {}) {
  const stale = []

  for (const rel of Object.keys(SHIPPED)) {
    const current = toLf(fs.readFileSync(path.join(repoRoot, rel), 'utf8'))
    const target = shippedPath(rel)
    if (fs.existsSync(target) && toLf(fs.readFileSync(target, 'utf8')) === current) continue

    stale.push(rel)
    if (write) {
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, current)
    }
  }

  return stale
}

function main() {
  const write = process.argv.includes('--write')
  const stale = checkShipped({ write })

  if (stale.length === 0) {
    console.log(
      `[migration 1.1.0] the ${Object.keys(SHIPPED).length} shipped copies match the repository.`,
    )
    return
  }

  if (write) {
    console.log('[migration 1.1.0] refreshed:')
    for (const rel of stale) console.log(`  ${rel}`)
    console.log('')
    console.log('  If a release already shipped the previous copy, add its hash to the pristine')
    console.log('  list in packages/cli/migrations/1.1.0/shipped.mjs.')
    return
  }

  console.error(
    '[migration 1.1.0] these files changed, and the copies the migration installs did not:',
  )
  for (const rel of stale) console.error(`  - ${rel}`)
  console.error('')
  console.error('  An upgrading project would receive the old one. Refresh them with:')
  console.error('    node packages/cli/migrations/1.1.0/shipped.mjs --write')
  process.exit(1)
}

/** Run as a script, not imported by the CLI. Compared by real path, as build-payload does. */
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
