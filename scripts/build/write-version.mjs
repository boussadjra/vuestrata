#!/usr/bin/env node
/**
 * Stamps the built artifact with what it actually is.
 *
 * Before this there was no way to tell which build a running deployment was
 * serving. `VUESTRATA_RELEASE` existed, but it only ever reached the error
 * reporter — so unless you had an error to look at, "which commit is live?"
 * was answered by guessing, or by diffing asset hashes by hand.
 *
 * Writes `dist/version.json`:
 *
 *   { "release": "…", "buildTime": "…", "runtimeMode": "…", "name": "…" }
 *
 * Deliberately a static JSON file rather than a value inlined into the bundle:
 * a monitor, a deploy script, or a human with curl can read it without parsing
 * JavaScript, and it costs one request that nothing on the critical path makes.
 * The app reads it too — see app/plugins/build-info.ts — to detect that a newer
 * version has been deployed.
 *
 * `release` comes from VUESTRATA_RELEASE (CI sets it to the git SHA). Outside
 * CI it falls back to `git rev-parse`, and to "unknown" where neither is
 * available — inside the Docker build, for instance, since .dockerignore
 * deliberately excludes .git.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { consola } from 'consola'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const logger = consola.withTag('write-version')

const outDir = resolve(root, 'dist')

if (!existsSync(outDir)) {
  logger.error(`No build output at ${outDir}. Run \`vpr build\` first.`)
  process.exit(1)
}

function resolveRelease() {
  const fromEnv = process.env.VUESTRATA_RELEASE?.trim()
  if (fromEnv) return fromEnv

  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    // No git available (Docker build, exported tarball). Not an error — the
    // deployment simply did not supply a release identifier.
    return 'unknown'
  }
}

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

const version = {
  name: pkg.name,
  version: pkg.version,
  release: resolveRelease(),
  runtimeMode: process.env.VUESTRATA_RUNTIME_MODE ?? 'production',
  buildTime: new Date().toISOString(),
}

writeFileSync(resolve(outDir, 'version.json'), `${JSON.stringify(version, null, 2)}\n`)

logger.success(
  `dist/version.json written (release: ${version.release}, mode: ${version.runtimeMode})`,
)
