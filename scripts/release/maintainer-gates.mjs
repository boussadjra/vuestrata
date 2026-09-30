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
 *   template-lock   the shipped `vuestrata.lock.json` describes every managed
 *                   file and registry region exactly as they are now
 *   payload         `packages/cli/payload` (what `upgrade` installs) is what
 *                   would be built from this checkout
 *   public-surface  (with --tests) the snapshot of the names a project's code
 *                   calls: Ui* props, icons, tokens, env variables, modules
 *
 * A project's equivalent is `vuestrata doctor`.
 *
 *     vpr lint:maintainer               # the first two
 *     vpr lint:maintainer -- --tests    # and the public-surface snapshots
 *
 * The template's CI and `release:verify` run it. The public-surface test also
 * runs inside CI's test job, where VUESTRATA_MAINTAINER=1 is set for the run.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const cliRoot = path.join(repoRoot, 'packages/cli')
const withTests = process.argv.includes('--tests')

if (!fs.existsSync(path.join(cliRoot, 'src/index.mjs'))) {
  console.error('[maintainer-gates] packages/cli is not in this checkout.')
  console.error('  These gates are for template maintainers; they check the template repository')
  console.error('  itself. In a project built from the template, run `vuestrata doctor` instead.')
  process.exit(1)
}

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

/** `vp` on the PATH, so a shell is needed on Windows, where it is a `.cmd`. */
function publicSurface() {
  return spawnSync('vp test --run test/unit/architecture/public-surface.test.ts', {
    cwd: repoRoot,
    env: { ...process.env, VUESTRATA_MAINTAINER: '1' },
    shell: true,
    stdio: 'inherit',
  }).status
}

const gates = [
  { name: 'template-lock', run: () => node('scripts/release/check-template-lock.mjs') },
  { name: 'payload', run: checkPayload },
  ...(withTests ? [{ name: 'public-surface', run: publicSurface }] : []),
]

// Every gate runs even when an earlier one fails, so one pass reports them all.
const results = gates.map(({ name, run }) => ({ name, ok: run() === 0 }))

console.log('')
console.log('[maintainer-gates]')
for (const { name, ok } of results) console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}`)

if (results.some(({ ok }) => !ok)) process.exit(1)
