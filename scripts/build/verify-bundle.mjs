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
 * The size budgets and the list of on-demand chunks have defaults here, and a
 * project changes them under `bundle` in
 * `src/modules/app/config/deploy.config.ts`, never in this file: see
 * `DEFAULT_BUDGETS`. `--root=<dir>` reads that file, and `vite.config.ts`,
 * from another project root than the one this script sits in.
 *
 * The helpers are exported for the unit tests; importing this file runs no
 * checks (see `isEntryPoint`).
 */
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, join, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

import { consola } from 'consola'

const logger = consola.withTag('verify-bundle')

/** The project this script belongs to: two directories up. */
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

// ─── Chunk names ──────────────────────────────────────────────────────────────

/**
 * An emitted chunk is `<name>-<hash>.js` — Vite's default `chunkFileNames`,
 * which the shipped vite.config.ts does not override. The hash is base64url,
 * so `-` and `_` belong to it: `docs--8Mo5HM9.js` is the chunk `docs`.
 * Anchoring on the hash's LENGTH is what keeps that unambiguous; splitting at
 * the last dash would not.
 *
 * Eight characters is that default. A config that says `[hash:12]` emits
 * twelve, and `hashLengthOf` reads the length off the build.
 */
const DEFAULT_HASH_LENGTH = 8

const stem = (file) => basename(file).replace(/\.js$/, '')

/**
 * How long the content hash of this build's chunks is.
 *
 * Every hashed file ends in a dash and that many characters, so the length is
 * the one distance from the end at which the most files have a dash. A dash
 * inside a name or inside a hash is at that distance in a few files, and the
 * separator is there in all of them. The default wins a tie, which only a
 * build of two or three files can produce.
 */
export function hashLengthOf(files) {
  const votes = new Map()
  for (const name of files.filter((file) => file.endsWith('.js')).map(stem)) {
    for (let at = name.indexOf('-', 1); at !== -1; at = name.indexOf('-', at + 1)) {
      const length = name.length - at - 1
      if (length > 0) votes.set(length, (votes.get(length) ?? 0) + 1)
    }
  }

  let best = DEFAULT_HASH_LENGTH
  for (const [length, count] of votes) {
    if (count > (votes.get(best) ?? 0)) best = length
  }
  return best
}

/**
 * The name a chunk was given, without its directory, content hash or
 * extension: `assets/msw-vendor-e1wNtvZD.js` → `msw-vendor`.
 *
 * A file that does not follow the pattern keeps its whole basename, so a
 * name check against it errs towards reporting a match rather than missing one.
 */
export function chunkName(file, hashLength = DEFAULT_HASH_LENGTH) {
  const name = stem(file)
  const dash = name.length - hashLength - 1
  const hashed =
    file.endsWith('.js') && dash > 0 && name[dash] === '-' && /^[\w-]+$/.test(name.slice(dash + 1))
  return hashed ? name.slice(0, dash) : name
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
export function chunksNamed(files, word, hashLength = DEFAULT_HASH_LENGTH) {
  return files.filter((file) => nameWords(chunkName(file, hashLength)).includes(word))
}

/**
 * Whether `file` is the chunk called `name`, or a part rolldown split off it.
 *
 * A group that is given a `maxSize`, or `entriesAware`, comes out as several
 * chunks, and rolldown numbers the ones after the first: `charts-vendor2`,
 * `comark3`. Each is as much the charting engine as the first. The whole name
 * is compared and nothing else, so `useDocsSidebar` and `component-docs` are
 * not `docs-vendor`.
 *
 * A build with no hash in its file names (`[name].js`) is read by the whole
 * file name as well, since nothing can be taken off it.
 */
export function isChunk(file, name, hashLength = DEFAULT_HASH_LENGTH) {
  const named = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\d*$`)
  return named.test(chunkName(file, hashLength)) || named.test(stem(file))
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
 *
 * A project with a different list does not edit this one. A group of its own
 * that pages load with `import()` goes under `bundle.onDemandChunks.add` in
 * its deploy.config.ts, and a library it renders on every page by design
 * (charts on a dashboard-only app) under `remove`.
 */
export const ON_DEMAND_CHUNKS = [
  ['charts-vendor', 'the charting engine'],
  ['docs-vendor', 'the markdown and syntax-highlighting engine'],
  ['msw-vendor', 'the mock backend'],
  ['comark', 'the docs renderer and its diagram engine'],
  ['axe', 'the accessibility checker'],
]

/**
 * What to look for when the config already has groups and the chunk is loaded
 * with the page all the same.
 *
 * The build output cannot say which module was shared: a chunk imports names
 * from another, minified, and not the modules behind them. So the message
 * says where a person finds it.
 */
const ON_DEMAND_SHARED_ADVICE = [
  'The usual cause is one small package the library shares with the rest of the app',
  '(tslib, a polyfill): the group takes it along with the library, an eager module',
  'imports it, and the whole chunk comes with it. To find it, build the demo target,',
  'which writes sourcemaps, and read "sources" in the .js.map of the chunk named above',
  'for a package that is not the library; then match that package in a group with a',
  'higher priority, or give the on-demand group includeDependenciesRecursively: false,',
  'as charts-vendor has, and check that the build has no circular chunk import.',
]

/**
 * `import … from "./x.js"`, `import "./x.js"` and `export … from "./x.js"`, as
 * rolldown writes them between chunks. Not `import("./x.js")`: that one is
 * fetched when the code reaches it, which is the whole difference.
 *
 * Also the two forms a minifier is free to write and rolldown does not today:
 * a name given as a string (`import { "a-b" as c } from`), and a comment ahead
 * of the specifier. A string is only read as a name inside the braces, so the
 * specifier of a bare `import "./a.js"` is never taken for one.
 */
const COMMENT = String.raw`\/\*[\s\S]*?\*\/`
const GAP = String.raw`(?:\s|${COMMENT})*`
const NAMES = String.raw`\{(?:[\w$,\s]|"[^"\n]*"|'[^'\n]*'|${COMMENT})*\}`
const CLAUSE = String.raw`(?:[\w$*,\s]|${COMMENT}|${NAMES})+?`
const STATIC_IMPORT = new RegExp(
  String.raw`(?<![.\w$])(?:import|export)${GAP}(?:${CLAUSE}\bfrom${GAP})?["'](\.{1,2}\/[^"']*)["']`,
  'g',
)

/** The specifiers a chunk imports statically: what a browser fetches before running it. */
export function staticImports(source) {
  return [...new Set([...source.matchAll(STATIC_IMPORT)].map((match) => match[1]))]
}

/**
 * The file a deployment answers with its own values. Every page loads it, and
 * it is not the app: it has a check of its own, and counting it here would let
 * a page that loads nothing else of this build look as if it loaded the app.
 */
const RUNTIME_CONFIG_FILE = 'runtime-config.js'

/** `<link rel>` values that make the browser download the file with the page. */
const LOADING_RELS = new Set(['stylesheet', 'modulepreload', 'preload'])

/** One attribute of a tag, whichever way its value is quoted, or undefined. */
function attribute(attributes, name) {
  const found = new RegExp(
    String.raw`(?:^|\s)${name}\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))`,
    'i',
  ).exec(attributes)
  return found ? (found[1] ?? found[2] ?? found[3]) : undefined
}

/**
 * The URLs index.html makes the browser download with the page, as written:
 * every `<script src>`, and every `<link>` that is a stylesheet or a preload.
 * Not an icon, a manifest or a `preconnect`, which name no file the page waits
 * for, and nothing inside a comment.
 */
export function pageReferences(html) {
  const urls = []
  for (const [, tag, attributes] of html
    .replace(/<!--[\s\S]*?-->/g, '')
    .matchAll(/<(script|link)\b([^>]*)>/gi)) {
    const isScript = tag.toLowerCase() === 'script'
    const url = attribute(attributes, isScript ? 'src' : 'href')
    if (!url) continue

    const rels = (attribute(attributes, 'rel') ?? '').toLowerCase().split(/\s+/)
    if (isScript || rels.some((rel) => LOADING_RELS.has(rel))) urls.push(url)
  }
  return urls
}

/**
 * The emitted file a URL in index.html names, or undefined when it names none.
 *
 * The URL is whatever `base` and `build.assetsDir` made it: `/assets/x.js`,
 * `/console/static/x.js`, `./assets/x.js`, `assets/x.js`,
 * `https://cdn.example.com/app/assets/x.js`. What they all end with is the
 * file's path under dist, so the longest tail of the URL that is an emitted
 * file is the file. Looking for a fixed `/assets/` instead found nothing in a
 * build with another `assetsDir`, and every check on what the page loads then
 * passed on an empty list.
 *
 * @param {string} url
 * @param {Set<string>} emitted  every file of the build, relative to dist
 */
export function emittedFileFor(url, emitted) {
  const path = url
    .split(/[?#]/)[0]
    // An absolute or protocol-relative URL: the origin is not part of the path.
    .replace(/^(?:[a-z][a-z\d+.-]*:)?\/\/[^/]*/i, '')
  const segments = path.split('/').filter((segment) => !['', '.', '..'].includes(segment))

  for (let from = 0; from < segments.length; from++) {
    const candidate = segments.slice(from).join('/')
    if (emitted.has(candidate)) return candidate
  }
  return undefined
}

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
 * Only files the build emitted are in it: a web font from another host is not
 * this build's weight, and a reference to a file that is not there is a broken
 * build, which a size cannot describe.
 *
 * @param {string} html      dist/index.html
 * @param {Map<string, string>} sources  each emitted .js file, relative to dist → its code
 * @param {Iterable<string>} [emitted]  every emitted file, relative to dist;
 *   the .js files alone when omitted
 * @returns {Map<string, string[]>}  file, relative to dist → what loads it
 */
export function eagerFiles(html, sources, emitted = sources.keys()) {
  const files = new Set(emitted)
  const loadedBy = new Map()
  const queue = []

  const load = (file, by) => {
    if (!loadedBy.has(file)) {
      loadedBy.set(file, [])
      queue.push(file)
    }
    if (!loadedBy.get(file).includes(by)) loadedBy.get(file).push(by)
  }

  for (const url of pageReferences(html)) {
    const file = emittedFileFor(url, files)
    if (file !== undefined && file !== RUNTIME_CONFIG_FILE) load(file, 'index.html')
  }

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

// ─── The budgets, and where a project changes them ────────────────────────────

/**
 * The size budgets, in KB of 1024 bytes.
 *
 * Nothing limited how big the bundle could get. Chunking was configured
 * thoughtfully in vite.config.ts and then never measured again, so a
 * dependency that doubled a vendor chunk — or a static import that dragged a
 * large library onto the critical path — shipped silently.
 *
 * These sit just above what THIS TEMPLATE measures. They are a regression
 * alarm, not a target: the numbers they pin are not good, they are simply what
 * is true today, and the check exists so a change has to be deliberate about
 * making them worse.
 *
 * Raising a budget is a legitimate decision. Doing it without noticing is not.
 * So a project does not edit the numbers here: this file is Vuestrata's, an
 * edited copy is held back by every upgrade, and the project would stop
 * receiving the checks. It sets its own under `bundle` in
 * `src/modules/app/config/deploy.config.ts`, which is the project's file, and
 * every run prints each value that differs from the default beside it.
 */
export const DEFAULT_BUDGETS = {
  /**
   * Gzipped, everything the page loads before first paint.
   *
   * Measured at 511 KB in a production build and 516 KB in the demo build,
   * once the charting engine stopped loading with every page (it was 728 and
   * 732, against a budget of 750). The 44 KB above the demo build is room, not
   * a target: each integration seam so far has cost about 4 KB, and a
   * project's own modules add their messages and composables to this number.
   * It is a sixth of what the charting engine weighs (264 KB), so nothing of
   * that size fits in it.
   */
  initialPayloadGzipKb: 560,

  /**
   * Raw, the largest JavaScript chunk that is loaded EAGERLY.
   *
   * Deliberately not "the largest chunk emitted". The biggest files in the
   * build are the markdown engine (~1.6 MB) and the docs vendor bundle
   * (~1.1 MB), and both are lazy — they load only when someone opens /docs. A
   * ceiling that had to clear those would be set so high it could never fail,
   * which is how a budget becomes decoration. This one only looks at what the
   * page loads.
   *
   * Today that is `ui-vendor`, the Reka primitives, at 346 KB. Chunks only:
   * the stylesheet is larger raw and has the budget below. Measured here, it
   * would put this ceiling above every chunk the page loads.
   */
  largestEagerChunkKb: 400,

  /**
   * Raw, the largest stylesheet that is loaded eagerly.
   *
   * Today that is the one stylesheet of the app, 639 KB: Tailwind's utilities
   * and all twelve themes in one file. It compresses to 85 KB, which the
   * payload budget counts, and that is exactly why it needs a number of its
   * own: CSS is repetitive, so a stylesheet can grow several times over while
   * its gzipped size, and with it the payload budget, barely moves. The
   * browser still parses every byte before the first paint.
   *
   * 700 KB leaves 61 KB, about a tenth: room for the utilities a project's own
   * pages bring in, and not for a second copy of the theme layer.
   */
  largestEagerStylesheetKb: 700,

  /**
   * Raw, every emitted .js file combined.
   *
   * Raised from 6.5 to 6.75 MiB on purpose: the demo build bundles every docs
   * page as a JS chunk, and integration documentation (the endpoint contract,
   * the develop-against-your-backend page, the corrected auth deep-dive) added
   * about 13 KB of prose. None of it is on the initial payload, which has its
   * own budget above.
   *
   * Raised again to 7 MiB with the integration seams: the demo build measured
   * 6948.7 KB once the collection dialects and their documentation had landed.
   * What grew is on-demand code (dialects a build names, docs pages), so the
   * number that guards first paint did not move with it.
   */
  totalJsKb: 7 * 1024,
}

/** How a run names each budget when a project has set its own. */
const BUDGET_LABELS = {
  initialPayloadGzipKb: 'initial payload budget',
  largestEagerChunkKb: 'largest eager chunk budget',
  largestEagerStylesheetKb: 'largest eager stylesheet budget',
  totalJsKb: 'total JS budget',
}

/** Where a project keeps its deployment configuration, relative to its root. */
const DEPLOY_CONFIG = 'src/modules/app/config/deploy.config.ts'

const firstLine = (text) => String(text).split('\n')[0]

/**
 * What the project declares under `bundle` in its deploy.config.ts.
 *
 * - `declared`  the key as written, when the file has one;
 * - `resolved`  its validated form (`resolveDeployBundle`);
 * - `problem`   why it is invalid, which fails the run;
 * - `notice`    why the file was not read. The defaults then apply, and the
 *               run says so in one line.
 *
 * Not being able to read the file is not a failure. A project that ejected, or
 * one that has not taken the release that writes the file, has no such file or
 * no loader for it, and its build must still be checked. That is also why the
 * loader is imported here and not at the top: a missing or older
 * `scripts/security/deploy-config.mjs` would otherwise stop this script from
 * loading at all.
 */
async function projectBundle(root, onDemandChunks) {
  let loader
  try {
    loader = await import('../security/deploy-config.mjs')
  } catch (error) {
    return {
      notice:
        `scripts/security/deploy-config.mjs could not be loaded (${firstLine(error.message)}), ` +
        `so ${DEPLOY_CONFIG} was not read: the default budgets apply.`,
    }
  }
  if (
    typeof loader.loadDeployConfig !== 'function' ||
    typeof loader.resolveDeployBundle !== 'function'
  ) {
    return {
      notice:
        'scripts/security/deploy-config.mjs is a copy that does not read `bundle`, ' +
        `so ${DEPLOY_CONFIG} was not read: the default budgets apply.`,
    }
  }

  if (!existsSync(resolve(root, DEPLOY_CONFIG))) {
    return {
      notice: `${DEPLOY_CONFIG} is not in this project: the default budgets apply.`,
      expected: true,
    }
  }

  let config
  try {
    config = await loader.loadDeployConfig({ root })
  } catch (error) {
    return { notice: `${firstLine(error.message)} The default budgets apply.` }
  }
  if (config.bundle === undefined) return {}

  try {
    return {
      declared: config.bundle,
      resolved: loader.resolveDeployBundle(config.bundle, { onDemandChunks }),
    }
  } catch (error) {
    return { declared: config.bundle, problem: error.message }
  }
}

// ─── How the vendor chunks are named ──────────────────────────────────────────

const VITE_CONFIG_FILES = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs']

/** `source` with its comments blanked. Strings are kept: a URL has `//` in it. */
function withoutComments(source) {
  let out = ''
  let at = 0
  while (at < source.length) {
    const char = source[at]
    const next = source[at + 1]

    if (char === '/' && next === '/') {
      while (at < source.length && source[at] !== '\n') at++
    } else if (char === '/' && next === '*') {
      const end = source.indexOf('*/', at + 2)
      at = end === -1 ? source.length : end + 2
    } else if (char === "'" || char === '"' || char === '`') {
      let end = at + 1
      while (end < source.length && source[end] !== char) {
        if (source[end] === '\\') end++
        // An unterminated quote on a line is prose (an apostrophe), not a string.
        if (char !== '`' && source[end] === '\n') break
        end++
      }
      out += source.slice(at, end + 1)
      at = end + 1
    } else {
      out += char
      at++
    }
  }
  return out
}

/**
 * An option of that name set in code: `name:`, `'name':`, the method `name(`,
 * or the shorthand `{ name }`.
 */
const declares = (code, name) =>
  new RegExp(String.raw`(?:^|[\s,{])(['"]?)(?:${name})\1\s*[(:,}]`, 'm').test(code)

/**
 * How a Vite config names its vendor chunks: with a `manualChunks` function
 * (`'function'`), with groups (`'groups'`), or `undefined` when it does
 * neither.
 *
 * The function is what 1.0 shipped. Rolldown gives every name it returns the
 * same priority, and a chunk also takes what its modules import, so the
 * charting chunk takes the Vue runtime and every page loads it. An upgraded
 * project that kept its own function fails the checks below, and has to be
 * told that this is why. Rolldown ignores the function once the config has
 * groups, so a config with both is read as having groups.
 */
export function chunkNaming(source) {
  const code = withoutComments(source)
  if (declares(code, 'codeSplitting|advancedChunks')) return 'groups'
  return declares(code, 'manualChunks') ? 'function' : undefined
}

/** `chunkNaming` for the config of the project at `root`; `'unknown'` without one to read. */
function projectChunkNaming(root) {
  for (const file of VITE_CONFIG_FILES) {
    try {
      return { file, naming: chunkNaming(readFileSync(resolve(root, file), 'utf8')) }
    } catch {
      // Not this spelling; try the next.
    }
  }
  return { file: 'vite.config.ts', naming: 'unknown' }
}

// ─── Checks ───────────────────────────────────────────────────────────────────

async function main(argv) {
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
    logger.error('Usage: verify-bundle.mjs --mode=production|demo [--dist=dist] [--root=.]')
    process.exit(1)
  }

  const distDir = resolve(process.cwd(), args.get('dist') ?? 'dist')

  /** Where deploy.config.ts and vite.config.ts are read from. */
  const projectRoot = args.has('root') ? resolve(process.cwd(), args.get('root')) : PROJECT_ROOT

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
  const hashLength = hashLengthOf(jsNames)

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
      const found = chunksNamed(jsNames, 'msw', hashLength)
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
      const found = chunksNamed(jsNames, 'msw', hashLength)
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

  // ─── Size budgets ───────────────────────────────────────────────────────────
  //
  // The numbers, and why they are what they are, are in `DEFAULT_BUDGETS`.
  // What the project sets under `bundle` in its deploy.config.ts replaces them
  // here, and is printed, so a budget that was raised stays visible in CI.

  const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`

  const bundle = await projectBundle(
    projectRoot,
    ON_DEMAND_CHUNKS.map(([name]) => name),
  )
  // A project without the file is told once, quietly. One whose file could not
  // be read is warned: a budget it raised there, or a chunk it added, is not
  // in force for this run.
  if (bundle.notice) logger[bundle.expected ? 'info' : 'warn'](bundle.notice)

  if (bundle.declared !== undefined) {
    check(`the bundle settings in ${DEPLOY_CONFIG} are valid`, () => bundle.problem ?? null)
  }

  // An invalid `bundle` has failed the run above; the rest is checked against
  // the defaults, so one typo does not hide what else is wrong with the build.
  const own = bundle.resolved ?? { budgets: {}, onDemandChunks: { add: [], remove: [] } }

  /** Each budget in bytes: the project's where it set one, else the default. */
  const budget = Object.fromEntries(
    Object.entries(DEFAULT_BUDGETS).map(([key, value]) => [
      key,
      (own.budgets[key] ?? value) * 1024,
    ]),
  )
  for (const [key, value] of Object.entries(own.budgets)) {
    logger.info(
      `${BUDGET_LABELS[key]} ${kb(value * 1024)} ` +
        `(default ${kb(DEFAULT_BUDGETS[key] * 1024)}, from deploy.config.ts)`,
    )
  }

  const onDemandChunks = [
    ...ON_DEMAND_CHUNKS.filter(([name]) => !own.onDemandChunks.remove.includes(name)),
    ...own.onDemandChunks.add.map((name) => [name, 'declared on demand in deploy.config.ts']),
  ]
  for (const name of own.onDemandChunks.remove) {
    logger.info(`on-demand chunk ${name} is not checked (removed in deploy.config.ts)`)
  }
  for (const name of own.onDemandChunks.add) {
    logger.info(`on-demand chunk ${name} is checked as well (added in deploy.config.ts)`)
  }

  /** What the browser must download before it can render: see `eagerFiles`. */
  function initialPayload() {
    const indexHtml = files.find((file) => relative(file) === 'index.html')
    if (!indexHtml) return null

    const html = readFileSync(indexHtml, 'utf8')
    const emitted = new Set(files.map(relative))
    const loadedBy = eagerFiles(html, jsSources, emitted)

    let raw = 0
    let gzip = 0
    const largest = { chunk: { name: '', size: 0 }, stylesheet: { name: '', size: 0 } }
    for (const file of loadedBy.keys()) {
      const contents = readFileSync(join(distDir, file))
      raw += contents.length
      gzip += gzipSync(contents).length

      const kind = file.endsWith('.js') ? 'chunk' : file.endsWith('.css') ? 'stylesheet' : null
      if (kind && contents.length > largest[kind].size) {
        largest[kind] = { name: file, size: contents.length }
      }
    }
    // What the page names, for the message when none of it was found.
    const references = pageReferences(html).filter(
      (url) => emittedFileFor(url, emitted) !== RUNTIME_CONFIG_FILE,
    )
    return { raw, gzip, count: loadedBy.size, largest, loadedBy, references }
  }

  const payload = initialPayload()

  /**
   * The checks below measure the files the page loads. With none found they
   * would all pass, on nothing, and print "0 files": that happened for any
   * build whose index.html named its files in a way this script did not read.
   * So finding at least the app's own script is a check, and the others run
   * only once it holds.
   */
  const loadsTheBuild =
    payload !== null && [...payload.loadedBy.keys()].some((file) => file.endsWith('.js'))

  if (payload) {
    check('index.html loads scripts this build emitted', () => {
      if (loadsTheBuild) return null

      const shown = payload.references.slice(0, 5).join(', ')
      const more = payload.references.length > 5 ? ` and ${payload.references.length - 5} more` : ''
      const names = payload.references.length
        ? `it names ${shown}${more}, and none of those is a .js file under ${distDir}`
        : `apart from ${RUNTIME_CONFIG_FILE}, it has no <script src>, stylesheet or preload`
      return (
        `${names}.\n      What the page loads cannot be measured, so the on-demand check and the ` +
        'size budgets of the page were NOT run.\n      Is --dist the directory this index.html ' +
        'was built into?'
      )
    })
  }

  /**
   * What to do about an on-demand chunk the page loads, for the config this
   * project has. An upgraded project that kept its own `manualChunks` function
   * fails here by construction, and its config has no codeSplitting comment to
   * be sent to.
   */
  function onDemandAdvice() {
    const { file, naming } = projectChunkNaming(projectRoot)
    const groups =
      'vue-vendor 30; ui-vendor and data-vendor 20; charts-vendor, docs-vendor and msw-vendor 10'

    if (naming === 'function') {
      return [
        `${file} still names the vendor chunks with a manualChunks function. Rolldown gives`,
        'every name that function returns the same priority, and a chunk also takes what its',
        'modules import: charts-vendor takes the Vue runtime, and every page then loads it.',
        'In build.rolldownOptions.output, replace the function with',
        'codeSplitting: { groups: [...] }, one { name, test, priority } for each name it returns:',
        `${groups}.`,
        'A module two groups reach goes to the higher priority, so what a page loads with',
        'import() comes last. UPGRADING.md has the six groups written out.',
      ]
    }

    return [
      'Something every page needs was grouped into it, or it is imported without',
      `import(): see the codeSplitting comment in ${file}.`,
      ...ON_DEMAND_SHARED_ADVICE,
      ...(naming === 'unknown'
        ? [
            'If the Vite config names the vendor chunks with a manualChunks function, that is the',
            'cause: replace it with codeSplitting.groups, each with a priority',
            `(${groups}). See UPGRADING.md.`,
          ]
        : []),
    ]
  }

  if (loadsTheBuild) {
    // The invariant the budgets only imply. A vendor group in vite.config.ts
    // takes what its `test` matches and everything those modules import, so a
    // group for a library loaded on demand can end up holding something every
    // page needs. Then every chunk imports it, and the library is on the
    // critical path with nothing in the source to show for it.
    check('chunks loaded on demand are not loaded with the page', () => {
      const found = onDemandChunks.flatMap(([name, what]) =>
        [...payload.loadedBy.keys()]
          .filter((file) => file.endsWith('.js') && isChunk(file, name, hashLength))
          .map((file) => {
            const importers = payload.loadedBy.get(file).filter((by) => by !== 'index.html')
            const shown = importers.slice(0, 3).join(', ')
            const more = importers.length > 3 ? ` and ${importers.length - 3} more` : ''
            const by = importers.length > 0 ? `imported by ${shown}${more}` : 'in index.html'
            return `${file} (${what}) is ${by}`
          }),
      )
      return found.length ? [...found, ...onDemandAdvice()].join('\n      ') : null
    })

    check(`initial payload within ${kb(budget.initialPayloadGzipKb)} gzipped`, () =>
      payload.gzip > budget.initialPayloadGzipKb
        ? `${kb(payload.gzip)} gzipped (${kb(payload.raw)} raw) across ${payload.count} files — over budget by ${kb(payload.gzip - budget.initialPayloadGzipKb)}`
        : null,
    )
    check(`largest eagerly-loaded chunk within ${kb(budget.largestEagerChunkKb)}`, () =>
      payload.largest.chunk.size > budget.largestEagerChunkKb
        ? `${payload.largest.chunk.name} is ${kb(payload.largest.chunk.size)} and is loaded on every page`
        : null,
    )
    check(`largest eagerly-loaded stylesheet within ${kb(budget.largestEagerStylesheetKb)}`, () =>
      payload.largest.stylesheet.size > budget.largestEagerStylesheetKb
        ? `${payload.largest.stylesheet.name} is ${kb(payload.largest.stylesheet.size)} and is loaded on every page`
        : null,
    )

    const { chunk, stylesheet } = payload.largest
    logger.info(
      `Initial payload: ${kb(payload.gzip)} gzipped, ${kb(payload.raw)} raw, ${payload.count} files ` +
        `(largest chunk: ${chunk.name} ${kb(chunk.size)}` +
        (stylesheet.size > 0
          ? `; largest stylesheet: ${stylesheet.name} ${kb(stylesheet.size)})`
          : ')'),
    )
  }

  const chunkSizes = jsFiles
    .map((file) => ({ name: relative(file), size: statSync(file).size }))
    .sort((a, b) => b.size - a.size)

  const totalJs = chunkSizes.reduce((sum, chunk) => sum + chunk.size, 0)

  check(`total JS within ${kb(budget.totalJsKb)}`, () =>
    totalJs > budget.totalJsKb ? `${kb(totalJs)} across ${jsFiles.length} files` : null,
  )

  logger.info(
    `Total JS: ${kb(totalJs)} in ${jsFiles.length} files. Largest chunks: ${chunkSizes
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

if (isEntryPoint()) await main(process.argv.slice(2))
