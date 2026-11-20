#!/usr/bin/env node
/**
 * Keeps the toolchain versions in the deployment configs honest.
 *
 * The Dockerfile, `vercel.json` and the CI workflows each install their own
 * copy of Node, pnpm and Vite+, and each pinned a version by hand. They had
 * drifted, silently and badly:
 *
 *   - the image installed pnpm 10.33.0 while `packageManager` declared 11.20.0
 *   - both deploy configs pinned vite-plus 0.1.16 while the repo resolved 0.2.9
 *   - the image built on Node 22 while every CI job ran Node 20
 *
 * None of that fails anything. It just means the artifact users receive is
 * produced by a toolchain no test ever ran against — which is the whole
 * premise of CI quietly not holding.
 *
 * Each version has exactly ONE source of truth here:
 *
 *   Node       .nvmrc
 *   pnpm       package.json → packageManager
 *   Vite+      the installed vite-plus package
 *
 * `.node-version` is held to `.nvmrc` too, and it is the one that decides what
 * runs on a developer's machine: `vp` resolves Node from `.node-version`, then
 * `devEngines.runtime`, then `engines.node`, and only then `.nvmrc`. Without
 * it, `engines.node` (a range) wins, `vp` picks the newest Node the range
 * allows, and every local run is on a different major from CI and the image.
 *
 * A deployment the project does not have has nothing to drift: a Dockerfile,
 * a `vercel.json`, a workflow or a `.node-version` that is not there is
 * skipped, not reported.
 *
 * Every workflow is read, not three by name: the one `vuestrata add ci` writes
 * for a project carries the same `NODE_VERSION` pin as the template's, and so
 * may a workflow the project wrote beside it. One that pins nothing and reads
 * no pin has nothing to drift either.
 *
 * Wired into `vpr lint` and CI.
 */
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { consola } from 'consola'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const logger = consola.withTag('toolchain-pins')

/**
 * Compare every pin under `root` with its source of truth.
 *
 * Returns what it found rather than exiting, so the unit tests can drive it
 * against a throwaway project: `fatal` when a source of truth is itself
 * missing, otherwise `problems` (empty when the pins agree), the `sources`
 * they were held to, and the files it `skipped` because the project has none.
 *
 * @param {string} [root] The project root.
 */
export function checkToolchainPins(root = repoRoot) {
  const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8')
  const has = (relativePath) => existsSync(resolve(root, relativePath))

  // ─── Sources of truth ──────────────────────────────────────────────────────

  const nodeVersion = read('.nvmrc').trim().replace(/^v/, '')
  const nodeMajor = /^(\d+)/.exec(nodeVersion)?.[1]

  const pkg = JSON.parse(read('package.json'))
  const pnpmVersion = pkg.packageManager?.split('@')[1]
  if (!pnpmVersion) {
    return { fatal: 'package.json has no `packageManager` field to pin pnpm against.' }
  }

  let vitePlusVersion
  try {
    vitePlusVersion = JSON.parse(read('node_modules/vite-plus/package.json')).version
  } catch {
    return { fatal: 'vite-plus is not installed — run `vp install` before this check.' }
  }

  // ─── Expectations ──────────────────────────────────────────────────────────

  const problems = []
  const skipped = []

  /**
   * Assert that every occurrence of `pattern` in `file` captures `expected`.
   *
   * Checking EVERY match rather than the first matters: the Dockerfile names
   * vite-plus twice (the CLI and its platform binary), and a fix that updated
   * one and not the other is precisely the failure mode here.
   */
  function expectAll(file, label, pattern, expected) {
    const source = read(file)
    const matches = [...source.matchAll(pattern)]

    if (matches.length === 0) {
      problems.push(
        `${file}: no ${label} pin found (pattern ${pattern}) — did the file change shape?`,
      )
      return
    }

    for (const match of matches) {
      const found = match[1]
      const matchingMajor =
        label === 'Node' && !expected.includes('.') && found.split('.')[0] === expected
      if (found !== expected && !matchingMajor) {
        problems.push(
          `${file}: ${label} pinned to ${found}, but the repo uses ${expected}.\n` +
            `      → in: ${match[0].trim()}`,
        )
      }
    }
  }

  /** Whether `file` is there to check. One that is not has nothing to drift. */
  function present(file) {
    if (has(file)) return true
    skipped.push(file)
    return false
  }

  // Dockerfile. A project that does not ship a container deletes it.
  if (present('Dockerfile')) {
    expectAll('Dockerfile', 'Node', /^FROM(?: --platform=\S+)? node:([\d.]+)/gm, nodeVersion)
    expectAll('Dockerfile', 'pnpm', /pnpm@([\d.]+)/g, pnpmVersion)
    // The digits matter: the platform bindings are named for their target
    // (`vite-plus-linux-x64-gnu`, `-linux-arm64-gnu`), and without them in the
    // class the x64 pin was never matched, so it could drift unchecked.
    expectAll('Dockerfile', 'Vite\\+', /vite-plus[a-z0-9-]*@([\d.]+)/g, vitePlusVersion)
  }

  // vercel.json. A project that deploys elsewhere deletes it.
  if (present('vercel.json')) {
    expectAll('vercel.json', 'Vite+', /vite-plus@([\d.]+)/g, vitePlusVersion)
  }

  // Workflows. `eject` removes deploy-demo.yml and release.yml and replaces
  // ci.yml with the project's, and a project may delete or rename any of them,
  // so they are found, not listed. One with a pin is held to it. One that
  // reads `env.NODE_VERSION` and no longer says what it is has lost its pin,
  // which is the "did the file change shape?" case. Any other workflow gets its
  // Node some other way, and that is not this check's to judge.
  const workflowsDir = '.github/workflows'
  const workflows = has(workflowsDir)
    ? readdirSync(resolve(root, workflowsDir))
        .filter((name) => /\.ya?ml$/.test(name))
        .sort((a, b) => a.localeCompare(b))
    : []
  for (const workflow of workflows) {
    const file = `${workflowsDir}/${workflow}`
    const source = read(file)
    if (!/NODE_VERSION: '[\d.]+'/.test(source) && !source.includes('env.NODE_VERSION')) continue
    expectAll(file, 'Node', /NODE_VERSION: '([\d.]+)'/g, nodeVersion)
  }

  // .node-version: what `vp` runs locally. Its major must be the one CI and
  // the image use, or "works on my machine" is a statement about another Node.
  if (has('.node-version')) {
    const pinned = read('.node-version').trim()
    const major = /^v?(\d+)/.exec(pinned)?.[1]
    const matches = nodeVersion.includes('.')
      ? pinned.replace(/^v/, '') === nodeVersion
      : major === nodeMajor
    if (!matches) {
      problems.push(
        `.node-version: pins Node ${pinned || '(nothing)'}, but .nvmrc builds on ${nodeVersion}.\n` +
          '      → `vp` reads .node-version first, so local runs are on a different version ' +
          'from CI and the image.',
      )
    }
  }

  // `engines.node` is a FLOOR, not a pin — it declares the oldest Node this
  // package supports and is allowed to be lower than the version we build with.
  // It must not be HIGHER, which would mean the build toolchain is unsupported
  // by the package's own declaration.
  const enginesFloor = pkg.engines?.node?.match(/(\d+)/)?.[1]
  if (enginesFloor && Number(enginesFloor) > Number(nodeMajor)) {
    problems.push(
      `package.json: engines.node requires >=${enginesFloor}, but .nvmrc builds on ${nodeMajor}.`,
    )
  }

  return { problems, skipped, sources: { nodeMajor, pnpmVersion, vitePlusVersion } }
}

// ─── Report ──────────────────────────────────────────────────────────────────

function run() {
  const { fatal, problems, skipped, sources } = checkToolchainPins()

  if (fatal) {
    logger.error(fatal)
    process.exit(1)
  }

  const { nodeMajor, pnpmVersion, vitePlusVersion } = sources

  if (problems.length > 0) {
    logger.box(
      `Toolchain pins are out of sync\n\n${problems.map((p) => `  ✗ ${p}`).join('\n\n')}\n\n` +
        `Sources of truth:\n` +
        `  Node   .nvmrc                    → ${nodeMajor}\n` +
        `  pnpm   package.json packageManager → ${pnpmVersion}\n` +
        `  Vite+  installed vite-plus        → ${vitePlusVersion}`,
    )
    process.exit(1)
  }

  if (skipped.length > 0) {
    logger.info(`Not in this project, so not checked: ${skipped.join(', ')}`)
  }
  logger.success(
    `Toolchain pins agree (node ${nodeMajor}, pnpm ${pnpmVersion}, vite-plus ${vitePlusVersion})`,
  )
}

/**
 * True when node was pointed at this file, false when something imported it.
 * Both sides are compared as real paths: node resolves symlinks in the entry
 * module's URL but leaves `process.argv[1]` as typed.
 */
function isEntryPoint() {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isEntryPoint()) run()
