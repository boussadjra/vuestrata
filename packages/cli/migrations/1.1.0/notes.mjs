import fs from 'node:fs'

import { hashFor, LOCKFILE_NAME } from '../../src/lib/lockfile.mjs'
import { compareVersions, releaseCore } from '../../src/lib/migrations.mjs'
import { PRISTINE } from './promotions.mjs'
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

/** `.env`, `.env.local`, `.env.production`, …: what a build may read. Not the example. */
function envFiles(root) {
  try {
    return fs
      .readdirSync(root)
      .filter((name) => /^\.env(\..+)?$/.test(name) && !name.endsWith('.example'))
      .sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}

/** Every value `key` is given across `files`, with the file that gives it. */
function envValues(ws, files, key) {
  const pattern = new RegExp(`^[ \\t]*(?:export[ \\t]+)?${key}[ \\t]*=[ \\t]*(.*)$`, 'gm')
  const found = []

  for (const file of files) {
    for (const match of ws.read(file).matchAll(pattern)) {
      const value = match[1]
        .replace(/[ \t]+#.*$/, '')
        .trim()
        .replace(/^(['"])(.*)\1$/, '$2')
      found.push({ file, value })
    }
  }
  return found
}

/**
 * Under the default session mode the jwt adapter now sends cookies on its
 * /auth/* requests, and a cross-origin API that answers `*` has its login
 * refused by the browser. It is the one change in 1.1.0 that can break a
 * deployment that works, so it is said here and not only in the changelog.
 *
 * Shown by the upgrade that replaces the adapter: while the project's jwt.ts is
 * still a release's copy. A project that edited it keeps its copy and the old
 * behaviour, and reads about the change in that file's own note.
 *
 * Narrowed by what the project's .env files say, where they say anything: not
 * shown for a project that builds with another adapter, has chosen another
 * session mode, or calls a same-origin path. A project that sets these in CI
 * has no file to read, and is told as a condition.
 */
function credentialedCorsNote(source, manifest, ws) {
  if (!PRISTINE[JWT_ADAPTER].includes(hashFor(JWT_ADAPTER, source, 'managed'))) return undefined

  const files = envFiles(ws.root)
  const adapters = envValues(ws, files, 'VUESTRATA_AUTH_ADAPTER')
  const modes = envValues(ws, files, 'VUESTRATA_SESSION_PERSISTENCE')
  const urls = envValues(ws, files, 'VUESTRATA_API_URL')

  const jwt = adapters.filter((entry) => entry.value === 'jwt')
  if (adapters.length > 0 && jwt.length === 0) return undefined
  if (modes.length > 0 && modes.every((entry) => entry.value !== 'refresh-cookie')) return undefined
  if (urls.length > 0 && urls.every((entry) => entry.value.startsWith('/'))) return undefined

  const who =
    jwt.length > 0
      ? `This project builds with VUESTRATA_AUTH_ADAPTER=jwt ` +
        `(${listOf([...new Set(jwt.map((entry) => entry.file))])}).`
      : 'This applies if the project builds with VUESTRATA_AUTH_ADAPTER=jwt; no .env file here ' +
        'says which adapter it uses.'

  return (
    `ACTION MAY BE NEEDED ON YOUR BACKEND. ${who} From 1.1.0, under the default ` +
    'VUESTRATA_SESSION_PERSISTENCE (refresh-cookie), the jwt adapter sends cookies ' +
    "(`credentials: 'include'`) on its /auth/* requests, which is what makes the refresh " +
    'cookie work at all. When the API is on another origin than the app, it must answer those ' +
    'requests with `Access-Control-Allow-Origin: <the exact origin of the app>` and ' +
    '`Access-Control-Allow-Credentials: true`. An API that answers `*` has its login refused ' +
    'by the browser. If the backend sets no refresh cookie, set ' +
    'VUESTRATA_SESSION_PERSISTENCE to none, session or local instead, and nothing changes. ' +
    'An API served from the same origin (VUESTRATA_API_URL=/api) needs neither.'
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
  ],
}
