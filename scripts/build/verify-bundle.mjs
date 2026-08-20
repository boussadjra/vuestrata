#!/usr/bin/env node
/**
 * Asserts the invariants that separate the two build targets.
 *
 * The whole dual-target design rests on claims about what is and is not in the
 * emitted bundle — "MSW is not in production", "demo credentials are compiled
 * out", "sourcemaps are not published". Those claims are invisible to type
 * checking, unit tests, and e2e alike: a regression that reintroduces a static
 * import of the mock handlers breaks none of them, it just silently ships a
 * mock backend to real users.
 *
 * This script is the only thing that can catch that, so it runs in CI for both
 * targets.
 *
 * Usage:
 *   node scripts/build/verify-bundle.mjs --mode=production [--dist=dist]
 *   node scripts/build/verify-bundle.mjs --mode=demo
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { consola } from 'consola'

const logger = consola.withTag('verify-bundle')

// ─── Arguments ────────────────────────────────────────────────────────────────

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith('--'))
    .map((arg) => {
      const [key, value = 'true'] = arg.slice(2).split('=')
      return [key, value]
    }),
)

const mode = args.get('mode')
if (mode !== 'production' && mode !== 'demo') {
  logger.error('Usage: verify-bundle.mjs --mode=production|demo [--dist=dist]')
  process.exit(1)
}

const distDir = resolve(process.cwd(), args.get('dist') ?? 'dist')

/**
 * Demo-isolation assertions.
 *
 * On by default now that demo state sits behind a single dynamic-import
 * boundary (`app/state/demo`). Pass `--strict-demo=false` only to triage a
 * failure locally — never in CI, because these are the checks that keep the
 * seeded super-admin and its full permission set out of production.
 */
const strictDemo = args.get('strict-demo') !== 'false'

// ─── File collection ──────────────────────────────────────────────────────────

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

let files
try {
  files = walk(distDir)
} catch {
  logger.error(`No build output at ${distDir}. Run \`vpr build\` first.`)
  process.exit(1)
}

const relative = (file) => file.slice(distDir.length + 1).replaceAll('\\', '/')
const jsFiles = files.filter((file) => file.endsWith('.js'))
const mapFiles = files.filter((file) => file.endsWith('.map'))
const jsSources = new Map(jsFiles.map((file) => [relative(file), readFileSync(file, 'utf8')]))

// ─── Assertions ───────────────────────────────────────────────────────────────

const failures = []
const checks = []

function check(description, predicate) {
  const problem = predicate()
  if (problem) {
    failures.push(`${description}\n    → ${problem}`)
    logger.error(description)
  } else {
    checks.push(description)
    logger.success(description)
  }
}

/** Chunk filenames containing `needle`, e.g. the msw-vendor manual chunk. */
function chunksNamed(needle) {
  return [...jsSources.keys()].filter((name) => name.toLowerCase().includes(needle))
}

/** Chunks whose CODE mentions `needle`. Used for literals, not for prose. */
function chunksContaining(needle) {
  return [...jsSources.entries()]
    .filter(([, source]) => source.includes(needle))
    .map(([name]) => name)
}

/**
 * Documentation pages are compiled to JS chunks containing their markdown as
 * string literals. They legitimately discuss demo credentials and MSW, so they
 * must be excluded from content-based checks or every one would false-positive.
 */
const DOCS_CHUNK_PATTERN =
  /(^|\/)(\d+\.[a-z0-9-]+|docs-vendor|docs|forms|auth-rbac|auth-deep-dive|environment)[-.]/i

function isDocsContentChunk(name) {
  return DOCS_CHUNK_PATTERN.test(name)
}

check('build output exists', () => (jsFiles.length === 0 ? `no .js files under ${distDir}` : null))

if (mode === 'production') {
  // The headline invariant. A static import anywhere in a module barrel is
  // enough to break this, which is exactly why it is checked mechanically.
  check('no MSW chunk is emitted', () => {
    const found = chunksNamed('msw')
    return found.length ? `found ${found.join(', ')}` : null
  })

  check('no chunk references the MSW vendor chunk', () => {
    const found = chunksContaining('msw-vendor')
    return found.length ? `referenced by ${found.join(', ')}` : null
  })

  check('the mock service worker is not published', () =>
    files.some((file) => relative(file) === 'mockServiceWorker.js')
      ? 'dist/mockServiceWorker.js exists — it should only ship in the demo build'
      : null,
  )

  // ── Demo isolation ────────────────────────────────────────────────────────
  //
  // Demo seed data grants a super_admin holding every permission, so shipping
  // it to production is both a footgun and a disclosure of the permission
  // model. These are opt-in behind --strict-demo because the demo state is
  // still statically imported from main.ts; Phase 3 moves it behind a dynamic
  // import boundary and CI switches this on permanently.
  //
  // The markers are string LITERALS that only exist in demo code — they survive
  // minification, unlike identifiers, and unlike the demo email address they do
  // not appear in documentation prose that is legitimately bundled.
  if (strictDemo) {
    const demoMarkers = [
      ['the demo IndexedDB store', 'vuestrata-demo-auth'],
      ['the demo integrity salt', 'vuestrata-demo-v1'],
      ['the demo account address', 'demo@vuestrata.dev'],
    ]

    for (const [label, marker] of demoMarkers) {
      check(`${label} is compiled out`, () => {
        const found = chunksContaining(marker).filter((name) => !isDocsContentChunk(name))
        return found.length ? `"${marker}" found in ${found.join(', ')}` : null
      })
    }
  }

  // Sourcemaps expose the full original source. They may be generated for an
  // error tracker, but they must be uploaded out-of-band, never published.
  check('no sourcemaps are published', () =>
    mapFiles.length ? `found ${mapFiles.length} .map file(s)` : null,
  )
}

if (mode === 'demo') {
  // The mirror image: the demo is broken without these, and a silently-broken
  // demo looks like an app whose every request 404s.
  check('an MSW chunk is emitted', () => {
    const found = chunksNamed('msw')
    return found.length ? null : 'no msw chunk found — the demo would have no backend'
  })

  check('the mock service worker is published', () =>
    files.some((file) => relative(file) === 'mockServiceWorker.js')
      ? null
      : 'dist/mockServiceWorker.js is missing — MSW cannot register',
  )

  check('index.html is emitted', () =>
    files.some((file) => relative(file) === 'index.html') ? null : 'dist/index.html is missing',
  )
}

// ─── Report ───────────────────────────────────────────────────────────────────

if (failures.length > 0) {
  logger.box(
    `Bundle verification FAILED for --mode=${mode}\n\n` +
      failures.map((failure) => `  ✗ ${failure}`).join('\n\n'),
  )
  process.exit(1)
}

logger.success(`Bundle verification passed for --mode=${mode} (${checks.length} checks).`)
