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
 * Wired into `vpr lint` and CI.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { consola } from 'consola'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const logger = consola.withTag('toolchain-pins')

const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8')

// ─── Sources of truth ────────────────────────────────────────────────────────

const nodeMajor = read('.nvmrc').trim()

const pkg = JSON.parse(read('package.json'))
const pnpmVersion = pkg.packageManager?.split('@')[1]
if (!pnpmVersion) {
  logger.error('package.json has no `packageManager` field to pin pnpm against.')
  process.exit(1)
}

let vitePlusVersion
try {
  vitePlusVersion = JSON.parse(read('node_modules/vite-plus/package.json')).version
} catch {
  logger.error('vite-plus is not installed — run `vp install` before this check.')
  process.exit(1)
}

// ─── Expectations ────────────────────────────────────────────────────────────

const problems = []

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
    if (found !== expected) {
      problems.push(
        `${file}: ${label} pinned to ${found}, but the repo uses ${expected}.\n` +
          `      → in: ${match[0].trim()}`,
      )
    }
  }
}

// Dockerfile
expectAll('Dockerfile', 'Node', /^FROM node:(\d+)/gm, nodeMajor)
expectAll('Dockerfile', 'pnpm', /pnpm@([\d.]+)/g, pnpmVersion)
expectAll('Dockerfile', 'Vite\\+', /vite-plus[a-z-]*@([\d.]+)/g, vitePlusVersion)

// vercel.json
expectAll('vercel.json', 'Vite+', /vite-plus@([\d.]+)/g, vitePlusVersion)

// Workflows
for (const workflow of ['ci.yml', 'deploy-demo.yml', 'release.yml']) {
  expectAll(`.github/workflows/${workflow}`, 'Node', /NODE_VERSION: '(\d+)'/g, nodeMajor)
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

// ─── Report ──────────────────────────────────────────────────────────────────

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

logger.success(
  `Toolchain pins agree (node ${nodeMajor}, pnpm ${pnpmVersion}, vite-plus ${vitePlusVersion})`,
)
