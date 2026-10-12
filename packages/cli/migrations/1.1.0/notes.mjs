import fs from 'node:fs'

import { LOCKFILE_NAME } from '../../src/lib/lockfile.mjs'
import { inSlot } from '../../src/lib/manifest.mjs'
import { compareVersions, releaseCore } from '../../src/lib/migrations.mjs'
import { adaptersBeingReplaced } from './promotions.mjs'
import { listOf } from './text.mjs'

/**
 * What 1.1.0 changes that no codemod can decide for a project: a backend that
 * has to answer differently, and a copy of the CLI no upgrade reaches.
 *
 * Both are said once, by the upgrade that takes a project from 1.0 to 1.1, and
 * not again on the next prerelease. Nothing in the project records that they
 * were read, and a note that comes back on every upgrade is a note nobody
 * reads; UPGRADING.md keeps them for whoever looks later.
 */

/**
 * Whether this upgrade is the one that crosses into 1.1.0. The lockfile on disk
 * still names the release the project is coming from: it is rewritten only when
 * the upgrade has been applied.
 */
function comingFromBefore110(ws) {
  if (!ws.exists(LOCKFILE_NAME)) return false
  try {
    const { template } = JSON.parse(ws.read(LOCKFILE_NAME))
    return typeof template === 'string' && compareVersions(releaseCore(template), '1.1.0') < 0
  } catch {
    return false
  }
}

// ─── jwt + refresh-cookie sends cookies ──────────────────────────────────────

const JWT_ADAPTER = 'src/modules/auth/adapters/jwt.ts'

/**
 * The files that say what a deployment is built with, strongest first, as Vite
 * layers them for `--mode production`.
 *
 * Deliberately not every file a build can read. `.env.local` is one, but it is
 * the developer's own: the docs say to copy `.env.example` there, so nearly
 * every project has one, holding the example's mock adapter and same-origin
 * API. `.env.development*` and `.env.test*` are not read by a production build
 * at all. A team that develops on mocks and sets `jwt` and a cross-origin API
 * in CI or a hosting dashboard is the ordinary case, and what its local files
 * say is no evidence about its deployment.
 */
const PRODUCTION_ENV_FILES = ['.env.production.local', '.env.production', '.env']

/** Every other `.env*` file in the project, except the example: what a developer runs with. */
function localEnvFiles(root) {
  try {
    return fs
      .readdirSync(root)
      .filter(
        (name) =>
          /^\.env\..+$/.test(name) &&
          !name.endsWith('.example') &&
          !PRODUCTION_ENV_FILES.includes(name),
      )
      .sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}

/** The value `source` gives `key` (its last assignment, as dotenv reads it), or `undefined`. */
function envValue(source, key) {
  const pattern = new RegExp(`^[ \\t]*(?:export[ \\t]+)?${key}[ \\t]*=[ \\t]*(.*)$`, 'gm')
  const last = [...source.matchAll(pattern)].at(-1)
  if (!last) return undefined

  return last[1]
    .replace(/[ \t]+#.*$/, '')
    .trim()
    .replace(/^(['"])(.*)\1$/, '$2')
}

/**
 * What a production build reads for `key` from the project's files, with the
 * file that says it: the strongest production file that sets it wins.
 * `undefined` when none does, which is the case for a project that configures
 * its deployment in CI.
 */
function productionValue(ws, key) {
  for (const file of PRODUCTION_ENV_FILES) {
    if (!ws.exists(file)) continue
    const value = envValue(ws.read(file), key)
    if (value !== undefined) return { file, value }
  }
  return undefined
}

/**
 * Why the note is a condition: nothing a deployment is built from names the
 * adapter. Says so about the local files that do, or the reader is left
 * wondering why a project whose `.env.local` says `mock` is being told this.
 */
function noProductionEvidence(ws) {
  const local = localEnvFiles(ws.root).filter(
    (file) => envValue(ws.read(file), 'VUESTRATA_AUTH_ADAPTER') !== undefined,
  )

  return local.length > 0
    ? `${listOf(local)} ${local.length === 1 ? 'sets' : 'set'} the adapter for local work, ` +
        'which says nothing about what a deployment is built with (CI or the hosting ' +
        'dashboard may set another), and no .env or .env.production file here does.'
    : 'No .env or .env.production file here says which adapter a deployment uses.'
}

/**
 * Under the default session mode the jwt adapter now sends cookies on its
 * /auth/* requests, and a cross-origin API that answers `*` has its login
 * refused by the browser. It is the one change in 1.1.0 that can break a
 * deployment that works, so it is said here and not only in the changelog.
 *
 * Shown by the upgrade that replaces the adapter: while jwt.ts, base.ts (where
 * the credentials are set) and types.ts are all still a release's copy. They
 * move as one unit, so a project that edited any of them keeps all three and
 * the old behaviour, and reads about the change in the unit's own note.
 *
 * Withheld only on evidence that it cannot apply, and only a file a production
 * build is made from is evidence (`PRODUCTION_ENV_FILES`): one that selects
 * another adapter, another session mode, or a same-origin API. Silence is the
 * expensive mistake here, so everything short of that prints the note: as a
 * fact when such a file selects `jwt`, and as a condition when none says, which
 * is the project that sets these in CI or in a hosting dashboard.
 */
function credentialedCorsNote(source, manifest, ws) {
  if (!adaptersBeingReplaced(ws)) return undefined

  const adapter = productionValue(ws, 'VUESTRATA_AUTH_ADAPTER')
  const mode = productionValue(ws, 'VUESTRATA_SESSION_PERSISTENCE')
  const url = productionValue(ws, 'VUESTRATA_API_URL')

  if (adapter && adapter.value !== 'jwt') return undefined
  if (mode && mode.value !== 'refresh-cookie') return undefined
  if (url && url.value.startsWith('/')) return undefined

  const who = adapter
    ? `This project builds with VUESTRATA_AUTH_ADAPTER=jwt (${adapter.file}).`
    : 'This applies if the project builds with VUESTRATA_AUTH_ADAPTER=jwt and calls an API on ' +
      `another origin. ${noProductionEvidence(ws)}`

  return (
    `ACTION MAY BE NEEDED ON YOUR BACKEND. ${who} From 1.1.0, under the default ` +
    'VUESTRATA_SESSION_PERSISTENCE (refresh-cookie), the jwt adapter sends cookies ' +
    "(`credentials: 'include'`) on its /auth/* requests, which is what makes the refresh " +
    'cookie work at all. When the API is on another origin than the app, it must answer those ' +
    'requests with `Access-Control-Allow-Origin: <the exact origin of the app>` and ' +
    '`Access-Control-Allow-Credentials: true`, and list the request headers it accepts ' +
    '(`Access-Control-Allow-Headers: Authorization, Content-Type`). A `*` in any of the three ' +
    'is read literally on a credentialed request, so an API that answers `*` has its login ' +
    'refused by the browser. If the backend sets no refresh cookie, set ' +
    'VUESTRATA_SESSION_PERSISTENCE to none, session or local instead, and nothing changes. ' +
    'An API served from the same origin (VUESTRATA_API_URL=/api) needs none of this. ' +
    'UPGRADING.md has the steps, and docs/6.configuration/1.environment.md what the backend ' +
    'must do under refresh-cookie.'
  )
}

// ─── The copy of the CLI a project inherits ──────────────────────────────────

const CLI_PACKAGE = 'packages/cli/package.json'

function inheritedCliVersion(source) {
  try {
    const pkg = JSON.parse(source)
    return pkg.name === '@vuestrata/cli' && typeof pkg.version === 'string'
      ? pkg.version
      : undefined
  } catch {
    return undefined
  }
}

/**
 * A project made from the template carries `packages/cli`, the template's own
 * source of this tool, at the version it was cloned at. No upgrade touches it,
 * and the `gen:*` scripts in package.json run it: after this upgrade they run a
 * generator and an `eject` written for 1.0.
 */
const inheritedCli = {
  kind: 'note',
  file: CLI_PACKAGE,
  pending: (source, manifest, ws) => {
    const version = inheritedCliVersion(source)
    return (
      version !== undefined &&
      compareVersions(releaseCore(version), '1.1.0') < 0 &&
      comingFromBefore110(ws)
    )
  },
  note: (source) =>
    `packages/cli is the copy of this CLI the project was created with ` +
    `(${inheritedCliVersion(source)}), and upgrades do not update it. The \`gen:*\` scripts in ` +
    'package.json still run that copy: its `add module` writes permissions into ' +
    'core/lib/rbac/types.ts where this release declares them in config/rbac.overrides.ts, and ' +
    'its `eject` edits files Vuestrata now maintains. Use the installed CLI ' +
    '(`vp exec vuestrata add module <name>`), and point those scripts at it: `vuestrata eject` ' +
    'does that and removes packages/cli, scripts/release and the CLI tests with the rest of ' +
    'what only the template needs.',
}

// ─── The Node that vp runs ───────────────────────────────────────────────────

const NVMRC = '.nvmrc'
const NODE_VERSION = '.node-version'

/** Whether package.json pins a runtime for `vp`, the other place it looks before `engines`. */
function pinsRuntime(ws) {
  try {
    return JSON.parse(ws.read('package.json')).devEngines?.runtime !== undefined
  } catch {
    return false
  }
}

/**
 * `vp` resolves Node from .node-version, then devEngines.runtime, then
 * engines.node, and only then .nvmrc. A project from 1.0 has an .nvmrc and an
 * `engines.node` range, so the range wins and every local run is on the newest
 * Node it allows, while CI and the image run what .nvmrc says. The file is the
 * project's, and which Node it develops on is its decision: a note.
 */
const nodePin = {
  kind: 'note',
  file: NVMRC,
  pending: (source, manifest, ws) =>
    comingFromBefore110(ws) && !ws.exists(NODE_VERSION) && !pinsRuntime(ws),
  note: (source) => {
    const major = source.trim()
    return (
      `${NVMRC} says Node ${major}, which is what CI and the Docker image use, but it is not ` +
      'what `vp` runs on your machine: it resolves Node from .node-version, then ' +
      '`devEngines.runtime` in package.json, then `engines.node`, and only then .nvmrc. This ' +
      'project has neither of the first two, so `vp check`, `vpr test` and `vpr build` run ' +
      'locally on the newest Node its `engines.node` range allows. To develop on the Node you ' +
      `ship with, add a ${NODE_VERSION} file holding \`${major}\` (\`vp env pin ${major}\` ` +
      'writes it). scripts/lint/check-toolchain-pins.mjs holds it to .nvmrc from then on.'
    )
  },
}

// The lint rule is managed, but these example screens belong to the project.
// Explain the required conversion without rewriting a project's styling.
const paletteExamples = {
  kind: 'note',
  note: (_source, manifest, ws) => {
    if (!comingFromBefore110(ws)) return false
    const files = [
      'users/presentation.ts',
      'users/components/UsersScreen.vue',
      'users/components/RolePermissionMatrix.vue',
      'showcase/pages/tables.vue',
    ]
      .map((file) => inSlot(manifest, 'modulesDir', file))
      .filter(
        (file) =>
          ws.exists(file) &&
          /\b(?:bg|text|border)-(?:red|orange|green|blue|yellow|cyan)-\d{2,3}\b/.test(
            ws.read(file),
          ),
      )
    if (!files.length) return false
    return (
      `${listOf(files)} still use raw palette colors and are project-owned, so they were preserved. ` +
      'The new lint rule has a zero baseline: convert these colors to semantic tokens before running `vpr lint`. ' +
      'Use the current Users and showcase examples as a reference; UPGRADING.md lists the role, status and rating mappings.'
    )
  },
}

export default {
  description: 'what this release changes outside the project, for a person to act on',
  steps: [
    {
      kind: 'note',
      file: JWT_ADAPTER,
      pending: (source, manifest, ws) => comingFromBefore110(ws),
      note: credentialedCorsNote,
    },
    inheritedCli,
    nodePin,
    paletteExamples,
  ],
}
