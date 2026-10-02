import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/**
 * The checks that only make sense in the template's own repository.
 *
 * `vpr lint` is the gate a project inherits, and it has to pass on ordinary
 * development: bump the app's version, edit a managed file, generate a module.
 * These do not. Each one compares the repository against a claim the template
 * makes about a RELEASE, so a project that changed anything would fail it:
 *
 *   template-lock     the shipped `vuestrata.lock.json` describes every managed
 *                     file and registry region exactly as they are now
 *   payload           `packages/cli/payload` (what `upgrade` installs) is what
 *                     would be built from this checkout
 *   migration-files   the copies of project-owned files a migration installs
 *                     (`packages/cli/migrations/<version>/shipped/`) are the
 *                     files this checkout ships
 *   maintainer-tests  (with --tests) the suites that read this repository as
 *                     the template: the public-surface snapshot of the names a
 *                     project's code calls, and the CLI suites' checks that the
 *                     migrations write what a fresh clone has
 *
 * A project's equivalent is `vuestrata doctor`.
 *
 *     vpr lint:maintainer               # the first three
 *     vpr lint:maintainer -- --tests    # and the maintainer-only tests
 *
 * The template's CI and `release:verify` run it. The same tests also run inside
 * CI's test job, where VUESTRATA_MAINTAINER=1 is set for the run.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const cliRoot = path.join(repoRoot, 'packages/cli')

/** Run a Node script from the repository root, inheriting its output. */
function node(script, args = []) {
  return spawnSync(process.execPath, [path.join(repoRoot, script), ...args], {
    cwd: repoRoot,
    stdio: 'inherit',
  }).status
}

/**
 * `--check` compares the built payload with the source, so there has to be one.
 * It is gitignored, and a fresh checkout does not have it; building it first
 * still reports what `--check` cannot do on its own — a region that cannot ship
 * whole — and leaves nothing behind that git tracks.
 */
function checkPayload() {
  const script = 'packages/cli/scripts/build-payload.mjs'
  if (!fs.existsSync(path.join(cliRoot, 'payload/index.json'))) {
    const built = node(script)
    if (built !== 0) return built
  }
  return node(script, ['--check'])
}

/** Every migration that installs copies of project-owned files checks its own. */
function checkMigrationFiles() {
  const migrations = path.join(cliRoot, 'migrations')
  const scripts = fs
    .readdirSync(migrations, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `packages/cli/migrations/${entry.name}/shipped.mjs`)
    .filter((script) => fs.existsSync(path.join(repoRoot, script)))

  // Every one runs, so one pass names every stale copy.
  return scripts.map((script) => node(script, ['--check'])).some((status) => status !== 0) ? 1 : 0
}

/** `vp` on the PATH, so a shell is needed on Windows, where it is a `.cmd`. */
function maintainerTests() {
  return spawnSync('vp test --run test/unit/architecture/public-surface.test.ts test/unit/cli', {
    cwd: repoRoot,
    env: { ...process.env, VUESTRATA_MAINTAINER: '1' },
    shell: true,
    stdio: 'inherit',
  }).status
}

/** The gates of one run, in the order they are reported. */
export function selectGates({ withTests = false } = {}) {
  return [
    { name: 'template-lock', run: () => node('scripts/release/check-template-lock.mjs') },
    { name: 'payload', run: checkPayload },
    { name: 'migration-files', run: checkMigrationFiles },
    ...(withTests ? [{ name: 'maintainer-tests', run: maintainerTests }] : []),
  ]
}

/**
 * Run every gate and say how each went. Every gate runs even when an earlier
 * one fails, so one pass reports them all; a gate that throws has failed.
 *
 * @param {{ name: string, run: () => number | null }[]} gates
 * @returns {{ ok: boolean, results: { name: string, ok: boolean }[] }}
 */
export function runGates(gates) {
  const results = gates.map(({ name, run }) => {
    try {
      return { name, ok: run() === 0 }
    } catch {
      return { name, ok: false }
    }
  })
  return { ok: results.every((result) => result.ok), results }
}

function main() {
  if (!fs.existsSync(path.join(cliRoot, 'src/index.mjs'))) {
    console.error('[maintainer-gates] packages/cli is not in this checkout.')
    console.error('  These gates are for template maintainers; they check the template repository')
    console.error('  itself. In a project built from the template, run `vuestrata doctor` instead.')
    process.exit(1)
  }

  const { ok, results } = runGates(selectGates({ withTests: process.argv.includes('--tests') }))

  console.log('')
  console.log('[maintainer-gates]')
  for (const result of results) console.log(`  ${result.ok ? 'pass' : 'FAIL'}  ${result.name}`)

  if (!ok) process.exit(1)
}

/**
 * Whether Node was asked to run this file, rather than a test importing it for
 * `runGates`. Compared by real path, so a symlinked checkout cannot turn the
 * gates into a silent no-op.
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
