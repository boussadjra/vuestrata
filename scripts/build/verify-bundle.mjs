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
 *
 * The chunk-name helpers and `eagerFiles` are exported for the unit tests;
 * importing this file runs no checks (see `isEntryPoint`).
 */
import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { basename, join, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

import { consola } from 'consola'

const logger = consola.withTag('verify-bundle')

// ─── Chunk names ──────────────────────────────────────────────────────────────

/**
 * An emitted chunk is `<name>-<hash>.js` — Vite's default `chunkFileNames`,
 * which vite.config.ts does not override. The hash is eight base64url
 * characters, so `-` and `_` belong to it: `docs--8Mo5HM9.js` is the chunk
 * `docs`. Anchoring on the hash's fixed length is what keeps that unambiguous;
 * splitting at the last dash would not.
 */
const HASHED_CHUNK = /^(.+)-[\w-]{8}\.js$/

/**
 * The name a chunk was given, without its directory, content hash or
 * extension: `assets/msw-vendor-e1wNtvZD.js` → `msw-vendor`.
 *
 * A file that does not follow the pattern keeps its whole basename, so a
 * name check against it errs towards reporting a match rather than missing one.
 */
export function chunkName(file) {
  const base = basename(file)
  return HASHED_CHUNK.exec(base)?.[1] ?? base.replace(/\.js$/, '')
}

/**
 * The words of a chunk name, split at punctuation and camelCase humps:
 * `msw-vendor` → msw, vendor; `useMswWorker` → use, msw, worker.
 */
function nameWords(name) {
  return name
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z\d]+/)
    .filter(Boolean)
}

/**
 * Chunks whose NAME contains `word` as a whole word, e.g. the msw-vendor
 * manual chunk for `msw`.
 *
 * This used to be a substring test on the whole filename, content hash
 * included, so `register-WvaWmSwy.js` lowercased to "…wmswy" and was reported
 * as an MSW chunk. The production check failed at random — a few percent of
 * builds, whenever some chunk's hash happened to spell it. Matching whole words
 * of the name alone also keeps an innocent `itemsWidget` chunk from reading as
 * "msw".
 */
export function chunksNamed(files, word) {
  return files.filter((file) => nameWords(chunkName(file)).includes(word))
}

// ─── What the page loads ──────────────────────────────────────────────────────

/**
 * Chunks a page asks for with `import()`, by name. None of them may be loaded
 * with the page.
 *
 * The first three are the on-demand groups of `codeSplitting` in
 * vite.config.ts, so their names are ours. `comark` and `axe` are names rolldown
 * derives from a module inside the chunk: should a later version name them
 * differently, those two entries match nothing, and the size budgets are what
 * is left to notice either on the critical path.
 *
 * Why by name, when the budgets would notice 264 KB gzipped of charting engine
 * too: a budget says "too big", and this says what is wrong. The charting chunk
 * was preloaded on every page for as long as the budget had room for it.
 */
export const ON_DEMAND_CHUNKS = [
  ['charts-vendor', 'the charting engine'],
  ['docs-vendor', 'the markdown and syntax-highlighting engine'],
  ['msw-vendor', 'the mock backend'],
  ['comark', 'the docs renderer and its diagram engine'],
  ['axe', 'the accessibility checker'],
]

/**
 * `import … from "./x.js"`, `import "./x.js"` and `export … from "./x.js"`, as
 * rolldown writes them between chunks. Not `import("./x.js")`: that one is
 * fetched when the code reaches it, which is the whole difference.
 */
const STATIC_IMPORT =
  /(?<![.\w$])(?:import|export)\s*(?:[\w$*{},\s]+?\bfrom\s*)?["'](\.{1,2}\/[^"']*)["']/g

/** The specifiers a chunk imports statically: what a browser fetches before running it. */
export function staticImports(source) {
  return [...new Set([...source.matchAll(STATIC_IMPORT)].map((match) => match[1]))]
}

/** What index.html itself references under assets/, whatever `base` the build has. */
const PAGE_ASSET = /(?:src|href)="[^"]*?\/(assets\/[^"]+)"/g

/**
 * Every file the browser downloads before the page can render, each with what
 * asks for it: `index.html`, or the chunks that import it statically.
 *
 * Read from index.html first: its `<script>`, stylesheets and every
 * `<link rel="modulepreload">` are real downloads, not hints a browser may
 * skip. Then followed through the static imports of those chunks, because the
 * preload links are only Vite's copy of that graph. A build with
 * `build.modulePreload: false` has no links and loads exactly the same files,
 * one round trip at a time.
 *
 * @param {string} html      dist/index.html
 * @param {Map<string, string>} sources  each emitted .js file, relative to dist → its code
 * @returns {Map<string, string[]>}  file, relative to dist → what loads it
 */
export function eagerFiles(html, sources) {
  const loadedBy = new Map()
  const queue = []

  const load = (file, by) => {
    if (!loadedBy.has(file)) {
      loadedBy.set(file, [])
      queue.push(file)
    }
    if (!loadedBy.get(file).includes(by)) loadedBy.get(file).push(by)
  }

  for (const match of html.matchAll(PAGE_ASSET)) load(match[1], 'index.html')

  while (queue.length > 0) {
    const file = queue.shift()
    const source = sources.get(file)
    if (source === undefined) continue

    for (const specifier of staticImports(source)) {
      const target = posix.join(posix.dirname(file), specifier)
      // Only what the build emitted. A docs page quoting an `import` in a code
      // sample is a string in a chunk, and names no file of this build.
      if (sources.has(target)) load(target, file)
    }
  }

  return loadedBy
}

// ─── Checks ───────────────────────────────────────────────────────────────────

function main(argv) {
  // ─── Arguments ──────────────────────────────────────────────────────────────

  const args = new Map(
    argv
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

  // ─── File collection ────────────────────────────────────────────────────────

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
  const jsNames = [...jsSources.keys()]

  // ─── Assertions ─────────────────────────────────────────────────────────────

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

  /** Chunks whose CODE mentions `needle`. Used for literals, not for prose. */
  function chunksContaining(needle) {
    return [...jsSources.entries()]
      .filter(([, source]) => source.includes(needle))
      .map(([name]) => name)
  }

  check('build output exists', () =>
    jsFiles.length === 0 ? `no .js files under ${distDir}` : null,
  )

  if (mode === 'production') {
    // The headline invariant. A static import anywhere in a module barrel is
    // enough to break this, which is exactly why it is checked mechanically.
    check('no MSW chunk is emitted', () => {
      const found = chunksNamed(jsNames, 'msw')
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

    // ── Demo isolation ──────────────────────────────────────────────────────
    //
    // Demo seed data grants a super_admin holding every permission, so shipping
    // it to production is both a footgun and a disclosure of the permission
    // model. On by default; see `strictDemo` above.
    //
    // The markers are string LITERALS that only exist in demo code — they
    // survive minification, unlike identifiers. EVERY chunk is searched,
    // including the in-app documentation: its pages are compiled into the
    // production bundle as string literals too, and anything they quote is
    // published at /docs. They used to be exempt, which let the demo account's
    // email and password ship in every production build. A docs page names
    // these values by the constant that holds them instead.
    if (strictDemo) {
      const demoMarkers = [
        ['the demo IndexedDB store', 'vuestrata-demo-auth'],
        ['the demo integrity salt', 'vuestrata-demo-v1'],
        ['the demo account address', 'demo@vuestrata.dev'],
        // `auth/adapters/mock.ts`. The registry references it only behind
        // `__VUESTRATA_DEMO__`, so the bundler drops the module; a second,
        // unguarded reference anywhere would bring it back without a sound.
        ['the mock auth adapter', 'mock-code-verifier'],
      ]

      for (const [label, marker] of demoMarkers) {
        check(`${label} is compiled out`, () => {
          const found = chunksContaining(marker)
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
      const found = chunksNamed(jsNames, 'msw')
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

  // ─── Runtime configuration ──────────────────────────────────────────────────
  //
  // Both targets. `runtime-config.js` is what lets one build serve every
  // environment: a deployment answers that URL with its own values, and the
  // page loads it before the app. That only works while it stays a separate
  // file. Inlined into index.html it could not differ per deployment, and
  // `script-src 'self'` would refuse to run it. Loaded as a module, or after
  // the app, the values would arrive once the API client had already read
  // its base URL.
  check('the runtime configuration is its own file, loaded before the app', () => {
    const indexHtml = files.find((file) => relative(file) === 'index.html')
    if (!indexHtml) return 'dist/index.html is missing'
    if (!files.some((file) => relative(file) === 'runtime-config.js')) {
      return 'dist/runtime-config.js is missing — every page asks for it'
    }

    const html = readFileSync(indexHtml, 'utf8')
    const tag = /<script\b[^>]*\bsrc="[^"]*runtime-config\.js"[^>]*>\s*<\/script>/.exec(html)
    if (!tag) return 'index.html does not load runtime-config.js with a <script src>'
    if (/\btype="module"|\basync\b|\bdefer\b/.test(tag[0])) {
      return `it must be a plain blocking script, found ${tag[0]}`
    }
    const moduleScript = html.search(/<script\b[^>]*\btype="module"/)
    if (moduleScript !== -1 && tag.index > moduleScript) {
      return 'it is loaded after the app module script'
    }
    if (html.includes('__VUESTRATA_RUNTIME__')) {
      return 'index.html assigns __VUESTRATA_RUNTIME__ inline — it must come from the file'
    }
    return null
  })

  // ─── Size budget ────────────────────────────────────────────────────────────
  //
  // Nothing here limited how big the bundle could get. Chunking was configured
  // thoughtfully in vite.config.ts and then never measured again, so a
  // dependency that doubled a vendor chunk — or a static import that dragged a
  // large library onto the critical path — shipped silently.
  //
  // The budgets below sit just above the CURRENT measurements. They are a
  // regression alarm, not a target: the numbers they pin are not good, they are
  // simply what is true today, and the check exists so a change has to be
  // deliberate about making them worse.
  //
  // Raising a budget is a legitimate decision. Doing it without noticing is not.

  /**
   * Bytes, gzipped, of everything the page loads before first paint.
   *
   * Measured at 504 KB in a production build and 508 KB in the demo build, once
   * the charting engine stopped loading with every page (it was 728 and 732,
   * against a budget of 750). The 52 KB above the demo build is room, not a
   * target: each integration seam so far has cost about 4 KB and more are
   * coming, and a project's own modules add their messages and composables to
   * this number. It is a fifth of what the charting engine weighs (264 KB), so
   * nothing of that size fits in it.
   */
  const INITIAL_PAYLOAD_BUDGET_GZIP = 560 * 1024

  /**
   * Bytes, raw, of the largest JavaScript chunk that is loaded EAGERLY.
   *
   * Deliberately not "the largest chunk emitted". The biggest files in the build
   * are the markdown engine (~1.6 MB) and the docs vendor bundle (~1.1 MB), and
   * both are lazy — they load only when someone opens /docs. A ceiling that had
   * to clear those would be set so high it could never fail, which is how a
   * budget becomes decoration. This one only looks at what the page loads.
   *
   * Today that is `ui-vendor`, the Reka primitives, at 346 KB. Chunks only: the
   * stylesheet is larger raw (639 KB, every theme in one file) but 85 KB
   * gzipped, and the budget above counts it. Measured here, it would put this
   * ceiling above every chunk the page loads.
   */
  const LARGEST_EAGER_CHUNK_BUDGET = 400 * 1024

  /**
   * Bytes, raw, of every emitted .js file combined.
   *
   * Raised from 6.5 to 6.75 MiB on purpose: the demo build bundles every docs
   * page as a JS chunk, and integration documentation (the endpoint contract,
   * the develop-against-your-backend page, the corrected auth deep-dive) added
   * about 13 KB of prose. None of it is on the initial payload, which has its
   * own budget above.
   */
  const TOTAL_JS_BUDGET = 6.75 * 1024 * 1024

  const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`

  /** What the browser must download before it can render: see `eagerFiles`. */
  function initialPayload() {
    const indexHtml = files.find((file) => relative(file) === 'index.html')
    if (!indexHtml) return null

    const loadedBy = eagerFiles(readFileSync(indexHtml, 'utf8'), jsSources)

    let raw = 0
    let gzip = 0
    let largest = { name: '', size: 0 }
    for (const file of loadedBy.keys()) {
      try {
        const contents = readFileSync(join(distDir, file))
        raw += contents.length
        gzip += gzipSync(contents).length
        if (file.endsWith('.js') && contents.length > largest.size) {
          largest = { name: file, size: contents.length }
        }
      } catch {
        // Referenced but not emitted; the build would be broken in a way the
        // other checks catch more clearly than a size check would.
      }
    }
    return { raw, gzip, count: loadedBy.size, largest, loadedBy }
  }

  const payload = initialPayload()

  if (payload) {
    // The invariant the budgets only imply. A vendor group in vite.config.ts
    // takes what its `test` matches and everything those modules import, so a
    // group for a library loaded on demand can end up holding something every
    // page needs. Then every chunk imports it, and the library is on the
    // critical path with nothing in the source to show for it.
    check('chunks loaded on demand are not loaded with the page', () => {
      const found = ON_DEMAND_CHUNKS.flatMap(([name, what]) =>
        [...payload.loadedBy.keys()]
          .filter((file) => file.endsWith('.js') && chunkName(file) === name)
          .map((file) => {
            const importers = payload.loadedBy.get(file).filter((by) => by !== 'index.html')
            const shown = importers.slice(0, 3).join(', ')
            const more = importers.length > 3 ? ` and ${importers.length - 3} more` : ''
            const by = importers.length > 0 ? `imported by ${shown}${more}` : 'in index.html'
            return `${file} (${what}) is ${by}`
          }),
      )
      return found.length
        ? [
            ...found,
            'Something every page needs was grouped into it, or it is imported without',
            'import(): see the codeSplitting comment in vite.config.ts',
          ].join('\n      ')
        : null
    })

    check(`initial payload within ${kb(INITIAL_PAYLOAD_BUDGET_GZIP)} gzipped`, () =>
      payload.gzip > INITIAL_PAYLOAD_BUDGET_GZIP
        ? `${kb(payload.gzip)} gzipped (${kb(payload.raw)} raw) across ${payload.count} files — over budget by ${kb(payload.gzip - INITIAL_PAYLOAD_BUDGET_GZIP)}`
        : null,
    )
    check(`largest eagerly-loaded chunk within ${kb(LARGEST_EAGER_CHUNK_BUDGET)}`, () =>
      payload.largest.size > LARGEST_EAGER_CHUNK_BUDGET
        ? `${payload.largest.name} is ${kb(payload.largest.size)} and is loaded on every page`
        : null,
    )

    logger.info(
      `Initial payload: ${kb(payload.gzip)} gzipped, ${kb(payload.raw)} raw, ${payload.count} files ` +
        `(largest chunk: ${payload.largest.name} ${kb(payload.largest.size)})`,
    )
  }

  const chunkSizes = jsFiles
    .map((file) => ({ name: relative(file), size: statSync(file).size }))
    .sort((a, b) => b.size - a.size)

  const totalJs = chunkSizes.reduce((sum, chunk) => sum + chunk.size, 0)

  check(`total JS within ${kb(TOTAL_JS_BUDGET)}`, () =>
    totalJs > TOTAL_JS_BUDGET ? `${kb(totalJs)} across ${jsFiles.length} files` : null,
  )

  logger.info(
    `Largest chunks: ${chunkSizes
      .slice(0, 5)
      .map((chunk) => `${chunk.name} ${kb(chunk.size)}`)
      .join(', ')}`,
  )

  // ─── Report ─────────────────────────────────────────────────────────────────

  if (failures.length > 0) {
    logger.box(
      `Bundle verification FAILED for --mode=${mode}\n\n` +
        failures.map((failure) => `  ✗ ${failure}`).join('\n\n'),
    )
    process.exit(1)
  }

  logger.success(`Bundle verification passed for --mode=${mode} (${checks.length} checks).`)
}

// ─── Entry point ──────────────────────────────────────────────────────────────

/**
 * True when Node was asked to run this file; false when something imports it,
 * as the unit tests do for the helpers above.
 *
 * Both sides go through realpath because Node resolves symlinks in the entry
 * path before it builds `import.meta.url`. Comparing the raw `argv[1]` would
 * make a symlinked checkout look like an import: every check skipped, exit
 * code 0, and a gate that silently checks nothing is worse than no gate.
 */
function isEntryPoint() {
  const invoked = process.argv[1]
  if (!invoked) return false
  try {
    return realpathSync(invoked) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isEntryPoint()) main(process.argv.slice(2))
