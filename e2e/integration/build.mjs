#!/usr/bin/env node
/**
 * Build the app the way a Laravel project would configure it, for the browser
 * tests in this folder: the `session` adapter, a same-origin API, and the two
 * seeded files selecting the Sanctum presets (`fixtures/`).
 *
 * The fixtures replace `auth.config.ts` and `api.overrides.ts`, and those are
 * files of the repository. So the build runs in a COPY of the project, in the
 * system's temporary directory, and nothing under `src/` is ever written to:
 * there is nothing to restore, whatever interrupts this. `node_modules` is
 * linked into the copy rather than copied.
 *
 * The result is left where the stub backend looks for it
 * (`node_modules/.cache/vuestrata/e2e-session/dist`, or `E2E_SESSION_DIST`).
 *
 * Usage: node e2e/integration/build.mjs
 */
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  rmdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')

/** Where the built app ends up. `playwright.config.ts` beside this file reads the same. */
const out = resolve(
  root,
  process.env.E2E_SESSION_DIST ?? 'node_modules/.cache/vuestrata/e2e-session/dist',
)

/** Top-level entries a build never reads, and what would only slow the copy down. */
const SKIPPED = new Set([
  'dist',
  '.git',
  '.vuestrata',
  'coverage',
  'playwright-report',
  'test-results',
  'e2e',
  'test',
])

/** The configuration under test. Set here, so no `.env` file of the checkout decides it. */
const BUILD_ENV = {
  VUESTRATA_RUNTIME_MODE: 'production',
  VUESTRATA_USE_MOCKS: 'false',
  VUESTRATA_AUTH_ADAPTER: 'session',
  VUESTRATA_SESSION_PERSISTENCE: 'none',
  VUESTRATA_API_URL: '/api',
}

const FIXTURES = {
  'auth.config.ts.txt': 'src/modules/app/config/auth.config.ts',
  'api.overrides.ts.txt': 'src/modules/app/config/api.overrides.ts',
}

const say = (message) => process.stdout.write(`[e2e:session] ${message}\n`)

const copy = mkdtempSync(join(tmpdir(), 'vuestrata-e2e-session-'))
let status = 1
try {
  say(`copying the project to ${copy}`)
  cpSync(root, copy, {
    recursive: true,
    // `node_modules` at any depth (a workspace package has its own), and the
    // entries above where they sit at the top.
    filter: (source) => basename(source) !== 'node_modules' && !SKIPPED.has(relative(root, source)),
  })
  for (const [fixture, target] of Object.entries(FIXTURES)) {
    cpSync(join(here, 'fixtures', fixture), join(copy, target))
  }
  // A junction on Windows, which needs no privilege; a plain link elsewhere.
  symlinkSync(
    join(root, 'node_modules'),
    join(copy, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  )

  say('building with VUESTRATA_AUTH_ADAPTER=session and the Sanctum presets')
  const build = spawnSync('vp build', {
    cwd: copy,
    env: { ...process.env, ...BUILD_ENV },
    stdio: 'inherit',
    shell: true,
  })
  status = build.status ?? 1
  if (status !== 0) throw new Error(`vp build exited with ${status}`)

  rmSync(out, { recursive: true, force: true })
  mkdirSync(dirname(out), { recursive: true })
  cpSync(join(copy, 'dist'), out, { recursive: true })
  if (!existsSync(join(out, 'index.html'))) throw new Error(`${out} has no index.html`)
  say(`built: ${out}`)
} catch (error) {
  status = status || 1
  process.stderr.write(`[e2e:session] ${error instanceof Error ? error.message : String(error)}\n`)
} finally {
  // The link first, and as a link. Only once it is gone is the copy removed:
  // a recursive delete must never be able to follow it into the real
  // node_modules.
  if (removeLink(join(copy, 'node_modules'))) {
    rmSync(copy, { recursive: true, force: true })
  } else {
    process.stderr.write(
      `[e2e:session] could not remove the node_modules link in ${copy}; the copy was left ` +
        'there. Remove the link, then the directory, by hand.\n',
    )
  }
}
process.exit(status)

/** Remove a directory link without touching what it points to. Answers whether it is gone. */
function removeLink(link) {
  const present = () => lstatSync(link, { throwIfNoEntry: false }) !== undefined
  if (!present()) return true
  try {
    // `rmdir` on a junction removes the junction; `unlink` removes a symlink.
    if (process.platform === 'win32') rmdirSync(link)
    else unlinkSync(link)
  } catch {
    // Reported by the caller, which then leaves the copy alone.
  }
  return !present()
}
