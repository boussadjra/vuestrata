/**
 * The canonical security-header set. One definition, every consumer.
 *
 * These headers previously existed as four hand-maintained copies — in
 * `vercel.json`, `public/_headers`, an nginx block built with `printf` inside
 * the Dockerfile, and a `<meta>` tag in `index.html`. Each carried a comment
 * asking the next person to keep the others in sync, and nothing checked that
 * they did. A CSP that is correct in three places out of four is a CSP that is
 * wrong wherever the app actually gets deployed.
 *
 * `sync-headers.mjs` renders every target from this module and, with `--check`,
 * fails when a committed file has drifted. That check runs in `vpr lint`.
 *
 * What a project needs beyond these defaults — another origin to connect to,
 * an image host, popup sign-in — it declares under `headers` in
 * `src/modules/app/config/deploy.config.ts`, not here. The generator and the
 * check read that file, so a widened policy committed through it passes.
 */

/**
 * Directives that never vary by deployment.
 *
 * `style-src` needs `'unsafe-inline'`: both Tailwind and Vue inject style
 * elements at runtime. That is a real weakening of the policy and cannot be
 * removed without nonce-ing every injected style, which Vue's runtime does not
 * support today.
 */
const BASE_CSP = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  'font-src': ["'self'", 'https://fonts.gstatic.com'],
  'img-src': ["'self'", 'data:', 'blob:'],
  'connect-src': ["'self'"],
  'worker-src': ["'self'", 'blob:'],
  'frame-ancestors': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'object-src': ["'none'"],
}

/**
 * Directives a `<meta http-equiv>` tag cannot express.
 *
 * `frame-ancestors` is ignored entirely when delivered via `<meta>` — the spec
 * requires it to come from a real header — so emitting it there is noise that
 * implies protection the tag does not provide. `X-Frame-Options: DENY` covers
 * the meta-only case.
 */
const META_UNSUPPORTED_DIRECTIVES = new Set(['frame-ancestors'])

/**
 * What the `<meta>` policy says about connections in an artifact whose API
 * origin is decided when it STARTS: nothing.
 *
 * By default the tag carries the same `connect-src` as the header, so a host
 * that sends no headers still gets a page that may only reach its own origin
 * and the ones it was generated for. That cannot work for the Docker image.
 * Its `index.html` is written when the image is built, the API URL of a
 * container is read when it starts, and a browser enforces the tag IN ADDITION
 * to the header: a `connect-src 'self'` baked into the page would block an API
 * origin the container's header allows.
 *
 * Leaving the directive out does not lift the restriction: `connect-src` then
 * falls back to `default-src 'self'`, which blocks the same requests. It has to
 * be stated, and wide. So this is an opt-in (`runtimeConfig`, the generator's
 * `--runtime-config`) for an artifact that is guaranteed to send the header,
 * which stays the authority there.
 */
const RUNTIME_CONFIG_META_CONNECT_SRC = ['*']

/**
 * The app's own default for `VUESTRATA_API_URL` (see `env.schema.ts`). A build
 * that sets nothing must get headers and an nginx config for the URL the app
 * will actually call.
 */
export const DEFAULT_API_URL = '/api'

/**
 * Where, in the nginx header template, the container entrypoint writes the
 * origins it reads from the environment. It replaces the placeholder and the
 * space before it, so a container with nothing to add leaves no trace.
 */
export const CONNECT_SRC_PLACEHOLDER = '__VUESTRATA_CONNECT_SRC__'

/** Where, in the unrouted-API template, the entrypoint writes the API path. */
export const API_PATH_PLACEHOLDER = '__VUESTRATA_API_PATH__'

/** Where the entrypoint writes what it renders: writable on a read-only root. */
export const RUNTIME_DIR = '/tmp/vuestrata'

/**
 * The path nginx answers itself for a liveness or readiness probe. Always at
 * the root of the server, whatever the base path: a probe is configured on the
 * container, which does not know where a proxy mounts the app.
 */
export const HEALTH_PATH = '/healthz'

/** The variable the build reads the base path from (see `env.schema.ts`). */
export const BASE_PATH_KEY = 'VUESTRATA_BASE_PATH'

/** The app at the root of its origin: what every committed target is generated for. */
export const DEFAULT_BASE_PATH = '/'

/** `/`, or `/` followed by segments of unreserved characters, each closed by `/`. */
const BASE_PATH = /^\/(?:[A-Za-z0-9._~-]+\/)*$/

/**
 * A base path as the generators use it, or an error saying what is wrong.
 * Unset and empty mean the root.
 *
 * `VUESTRATA_BASE_PATH` is validated by the app's own schema before a build
 * starts. This does not rely on that having run: the value also arrives here
 * from a command line (`--base-path`) and from a Docker build argument, and
 * what it is written into is an nginx configuration, a `_headers` file and a
 * Vercel route pattern. A `;`, a `{`, a space, a `$` or a line break would end
 * a directive or start another; `//host/` and `..` would point the redirect at
 * `/` somewhere else. So the rule is restated here, and it is the same rule:
 * it starts and ends with `/`, and holds letters, digits and `._~-` between.
 */
export function resolveBasePath(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_BASE_PATH

  const fail = (reason) => {
    throw new Error(`${BASE_PATH_KEY}=${JSON.stringify(value)} is not a base path: ${reason}`)
  }
  if (typeof value !== 'string') fail('expected a string.')
  if (/^[A-Za-z]:[\\/]/.test(value)) {
    fail(
      'it is a file path. Git Bash rewrites an argument that starts with "/" into one: set ' +
        'MSYS_NO_PATHCONV=1 for the command.',
    )
  }
  if (!BASE_PATH.test(value)) {
    fail(
      'it must start and end with "/" and hold only letters, digits and "._~-" in between, ' +
        'such as "/console/".',
    )
  }
  if (value.split('/').some((segment) => segment === '.' || segment === '..')) {
    fail('it cannot have a "." or ".." segment.')
  }
  return value
}

/**
 * The paths above the app and the app's own, without their trailing slash:
 * `/apps` and `/apps/console` for `/apps/console/`. None for the root.
 */
function basePathAncestors(basePath) {
  const segments = basePath.split('/').filter(Boolean)
  return segments.map((_, index) => `/${segments.slice(0, index + 1).join('/')}`)
}

export const COOP_VALUES = ['same-origin', 'same-origin-allow-popups', 'unsafe-none']

// ─── Sources ─────────────────────────────────────────────────────────────────

/** A DNS label: letters, digits and inner hyphens. */
const LABEL = '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?'

/**
 * `scheme://host[:port]`, with an optional leading `*.` label. No path, no
 * query, no credentials: a CSP host-source. IPv6 literals are not accepted.
 * The groups: the wildcard, the host after it, the port.
 */
const ORIGIN = new RegExp(`^(?:https?|wss?)://(\\*\\.)?(${LABEL}(?:\\.${LABEL})*)(?::(\\d+))?$`)

/** A shell-safe environment variable name. */
const ENV_NAME = /^[A-Z_][A-Z0-9_]*$/

/**
 * Names the container entrypoint cannot read from its environment: the shell
 * resets `IFS` when it starts, and the script sets `LC_ALL` itself.
 */
const UNREADABLE_ENV_NAMES = new Set(['IFS', 'LC_ALL'])

/** The names a runtime-overridable variable may have: what Vite exposes. */
const RUNTIME_KEY = /^VUESTRATA_[A-Z0-9_]+$/

/**
 * What stops `source` (lower-cased) from being a CSP origin, as a hint for the
 * error message, or null when it is one. `undefined` means it does not have
 * the shape of an origin at all.
 *
 * A wildcard needs two labels after it: `https://*.com` is every site under a
 * public suffix, which restricts nothing. A port is 1–65535, written as a URL
 * parser would write it; a browser discards the directive for `:99999`.
 */
function describeOriginIssue(source, wildcard) {
  const match = ORIGIN.exec(source)
  if (!match) return undefined
  const [, star, host, port] = match

  if (star && !wildcard) {
    return 'A wildcard cannot come from a URL; list the origins it stands for.'
  }
  if (star && !host.includes('.')) {
    return (
      `"*.${host}" would allow every site under "${host}". A wildcard must be followed by at ` +
      'least two labels, such as https://*.example.com.'
    )
  }
  if (port !== undefined && (!/^[1-9]\d{0,4}$/.test(port) || Number(port) > 65535)) {
    return 'A port is a number from 1 to 65535, without leading zeros.'
  }
  return null
}

/**
 * A configured source as a CSP origin, or an error saying what is wrong.
 *
 * This is the single most common way to get a CSP wrong: a path is not a valid
 * source in the form people write it, and ONE invalid source makes the browser
 * discard the entire directive — so `connect-src 'self' https://api.example.com/v1,`
 * silently provides no protection at all rather than failing loudly. Hence the
 * refusal, here, of anything that is not exactly an origin.
 *
 * `wildcard: false` is for an origin derived from a URL — the API URL, a
 * variable's value — where a `*` is never meant and the container entrypoint
 * refuses one as well.
 */
function originSource(value, label, { wildcard = true } = {}) {
  if (typeof value !== 'string') {
    throw new Error(`${label}: expected a string, received ${JSON.stringify(value)}.`)
  }
  const source = value.toLowerCase()
  const issue = describeOriginIssue(source, wildcard)
  if (issue === null) return source

  let hint = issue ?? 'Write an origin: scheme://host[:port], with http, https, ws or wss.'
  if (issue === undefined) {
    try {
      const { origin } = new URL(value)
      // Parses as a URL with a usable origin, so what was written has more
      // than that: a path, a query, credentials.
      if (describeOriginIssue(origin, wildcard) === null) {
        hint = `A CSP source is an origin alone; write "${origin}".`
      }
    } catch {
      // Not a URL at all: the general hint says what one looks like.
    }
  }
  throw new Error(`${label}: ${JSON.stringify(value)} is not an origin. ${hint}`)
}

/** Sources that are either an origin or one of the listed keywords and schemes. */
function sourceList(values, label, literals = []) {
  if (values === undefined) return []
  if (!Array.isArray(values)) throw new Error(`${label}: expected a list of sources.`)
  return values.map((value, index) =>
    literals.includes(value) ? value : originSource(value, `${label}[${index}]`),
  )
}

function envNames(values, label) {
  if (values === undefined) return []
  if (!Array.isArray(values)) throw new Error(`${label}: expected a list of variable names.`)
  for (const name of values) {
    if (typeof name !== 'string' || !ENV_NAME.test(name)) {
      throw new Error(
        `${label}: ${JSON.stringify(name)} is not an environment variable name ` +
          '(capitals, digits and underscores).',
      )
    }
    if (UNREADABLE_ENV_NAMES.has(name)) {
      throw new Error(
        `${label}: ${name} cannot be read from a container's environment: the shell sets it itself.`,
      )
    }
  }
  return [...values]
}

const HEADER_OPTIONS = new Set([
  'connectSrc',
  'connectSrcFromEnv',
  'websocketFromEnv',
  'imgSrc',
  'frameSrc',
  'fontSrc',
  'crossOriginOpenerPolicy',
  'frameAncestors',
])

/**
 * `headers` from `deploy.config.ts`, validated and with every field present.
 *
 * Every problem is collected and thrown at once, naming the field, so a
 * project fixes its config in one pass. Nothing invalid is ever dropped
 * silently: a typo in a field name would otherwise mean a policy narrower than
 * the one its author believes they shipped.
 */
export function resolveDeployHeaders(headers = {}) {
  if (headers === null || typeof headers !== 'object' || Array.isArray(headers)) {
    throw new Error('deploy.config.ts: `headers` must be an object.')
  }

  const problems = []
  const attempt = (read, fallback) => {
    try {
      return read()
    } catch (error) {
      problems.push(error.message)
      return fallback
    }
  }

  for (const key of Object.keys(headers)) {
    if (!HEADER_OPTIONS.has(key)) {
      problems.push(`headers.${key}: unknown option. Known: ${[...HEADER_OPTIONS].join(', ')}.`)
    }
  }

  const resolved = {
    connectSrc: attempt(() => sourceList(headers.connectSrc, 'headers.connectSrc'), []),
    connectSrcFromEnv: attempt(
      () => envNames(headers.connectSrcFromEnv, 'headers.connectSrcFromEnv'),
      [],
    ),
    websocketFromEnv: attempt(
      () => envNames(headers.websocketFromEnv, 'headers.websocketFromEnv'),
      [],
    ),
    imgSrc: attempt(
      () => sourceList(headers.imgSrc, 'headers.imgSrc', ['https:', 'data:', 'blob:']),
      [],
    ),
    frameSrc: attempt(() => sourceList(headers.frameSrc, 'headers.frameSrc'), []),
    fontSrc: attempt(() => sourceList(headers.fontSrc, 'headers.fontSrc', ['data:']), []),
    frameAncestors: attempt(
      () => sourceList(headers.frameAncestors, 'headers.frameAncestors', ["'self'", "'none'"]),
      [],
    ),
    crossOriginOpenerPolicy: headers.crossOriginOpenerPolicy ?? 'same-origin',
  }

  if (!COOP_VALUES.includes(resolved.crossOriginOpenerPolicy)) {
    problems.push(
      `headers.crossOriginOpenerPolicy: ${JSON.stringify(headers.crossOriginOpenerPolicy)} is ` +
        `not one of ${COOP_VALUES.join(', ')}.`,
    )
  }
  if (resolved.frameAncestors.includes("'none'") && resolved.frameAncestors.length > 1) {
    problems.push("headers.frameAncestors: 'none' cannot be combined with another source.")
  }

  if (problems.length > 0) {
    throw new Error(`Invalid deploy.config.ts headers:\n  - ${problems.join('\n  - ')}`)
  }
  return resolved
}

/**
 * The names a deployment may set at runtime, validated: the built-in list
 * followed by the project's own (`runtime` in `deploy.config.ts`).
 */
export function resolveRuntimeKeys(builtinKeys = [], declared = []) {
  if (!Array.isArray(declared)) {
    throw new Error('deploy.config.ts: `runtime` must be a list of variable names.')
  }
  const keys = [...new Set([...builtinKeys, ...declared])]
  for (const key of keys) {
    if (typeof key !== 'string' || !RUNTIME_KEY.test(key)) {
      throw new Error(
        `deploy.config.ts: runtime key ${JSON.stringify(key)} must be VUESTRATA_ followed by ` +
          'capitals, digits and underscores.',
      )
    }
  }
  return keys
}

/**
 * Turn an API URL into a CSP `connect-src` source.
 *
 * A same-origin path (`/api`, the reverse-proxy setup) needs nothing beyond
 * `'self'`. A cross-origin API needs its ORIGIN — scheme, host and port, with
 * no path.
 */
export function connectSrcFor(apiUrl) {
  if (!apiUrl || apiUrl.startsWith('/')) return null
  return urlOrigin(apiUrl, 'VUESTRATA_API_URL', ['http:', 'https:'])
}

/** The origin of an absolute URL whose scheme is one of `protocols`. */
function urlOrigin(value, name, protocols) {
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(
      `Cannot derive a CSP connect-src from ${name}="${value}": ` +
        `it is neither an absolute URL nor a same-origin path starting with "/".`,
    )
  }
  if (!protocols.includes(parsed.protocol)) {
    throw new Error(
      `Cannot derive a CSP connect-src from ${name}="${value}": its scheme must be one of ` +
        `${protocols.map((protocol) => protocol.slice(0, -1)).join(', ')}.`,
    )
  }
  // Not `parsed.origin`: the parts say the same without depending on which
  // schemes a runtime gives a tuple origin. The URL parser lets `*` through as
  // a host character and `:0` as a port; neither is an origin to allow.
  return originSource(`${parsed.protocol}//${parsed.host}`, name, { wildcard: false })
}

/** `https://x` → `wss://x`, `http://x` → `ws://x`; a ws(s) origin is kept. */
function websocketOrigin(origin) {
  return origin.replace(/^http/, 'ws')
}

/**
 * The origins the environment adds to `connect-src`, in the order the
 * container entrypoint derives them: `connectSrcFromEnv`, then
 * `websocketFromEnv`. An unset or empty variable adds nothing.
 */
function envConnectSources(resolved, env) {
  const valueOf = (name) => {
    const value = env[name]
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
  }
  const any = ['http:', 'https:', 'ws:', 'wss:']

  return [
    ...resolved.connectSrcFromEnv.flatMap((name) => {
      const value = valueOf(name)
      return value ? [urlOrigin(value, name, any)] : []
    }),
    ...resolved.websocketFromEnv.flatMap((name) => {
      const value = valueOf(name)
      return value ? [websocketOrigin(urlOrigin(value, name, any))] : []
    }),
  ]
}

/**
 * The path prefix of a same-origin API, without its trailing slash.
 *
 * `VUESTRATA_API_URL=/api` means the browser sends `/api/...` to whatever
 * served the app, and something in front of that server routes the path to
 * the backend. Returns null when the API is on another origin, or at `/`,
 * where no prefix separates its requests from the app's own paths.
 *
 * The prefix is written into the nginx config, so it is held to characters
 * that can neither end a directive nor start a variable. The container
 * entrypoint applies the same rule to the value it is started with — this is
 * the reference it is tested against.
 */
export function sameOriginApiPath(apiUrl, { basePath } = {}) {
  if (!apiUrl?.startsWith('/')) return null

  const path = apiUrl.replace(/\/+$/, '')
  if (path === '') return null

  if (!/^(?:\/[\w.~-]+)+$/.test(path)) {
    throw new Error(
      `Cannot route VUESTRATA_API_URL="${apiUrl}" in nginx: a same-origin API path must be ` +
        `"/" followed by segments of letters, digits and "._~-".`,
    )
  }
  if (path.split('/').some((segment) => segment === '.' || segment === '..')) {
    throw new Error(
      `Cannot route VUESTRATA_API_URL="${apiUrl}" in nginx: a same-origin API path cannot ` +
        'have a "." or ".." segment.',
    )
  }
  if (reservedApiPaths(basePath).includes(path)) {
    throw new Error(
      `Cannot route VUESTRATA_API_URL="${apiUrl}" in nginx: ${path} is a path this server ` +
        'answers itself. Serve the API under another one, such as /api.',
    )
  }
  return path
}

/**
 * The paths the image's server block has a location of its own for: the
 * health probe and every exact or prefix cache rule. None can be the API path.
 * nginx refuses two locations for one path, and would stop on "duplicate
 * location" without saying which variable asked for it.
 *
 * The entrypoint reads the list from `docker/runtime/keys`, which is generated
 * with the server block, so the two cannot disagree.
 *
 * Under a base path the rules are the app's files under it, and the list also
 * holds the prefix itself and every path above it (`/apps`, `/apps/console`).
 * An API there would take the app's own requests: `^~ /apps/` answers
 * everything under it, the app included. An API BELOW the base
 * (`/console/api`) is fine, and so is one beside it (`/api`).
 */
export function reservedApiPaths(basePath) {
  const base = resolveBasePath(basePath)
  const fromRules = cacheRulesFor(base)
    .map((rule) => /^(?:=|\^~) (\/.+?)\/?$/.exec(rule.nginxLocation ?? '')?.[1])
    .filter(Boolean)
  return [HEALTH_PATH, ...fromRules, ...basePathAncestors(base)]
}

// ─── The policy ──────────────────────────────────────────────────────────────

/**
 * Build the CSP string.
 *
 *   apiUrl        widens `connect-src` when the backend is cross-origin
 *   headers       `headers` from `deploy.config.ts`
 *   env           resolves `connectSrcFromEnv` / `websocketFromEnv`; omit it
 *                 for output that must not depend on the environment
 *   extraOrigins  more `connect-src` origins, for a caller that knows some
 *   forMeta       the `<meta>` variant: no `frame-ancestors`, which a tag
 *                 cannot express, and otherwise the same policy
 *   runtimeConfig with `forMeta`, for an artifact whose API origin is decided
 *                 at start — see `RUNTIME_CONFIG_META_CONNECT_SRC`
 *   template      the nginx template: `connect-src` carries only what is known
 *                 at build time, then the placeholder the entrypoint fills
 */
export function buildCsp({
  apiUrl = DEFAULT_API_URL,
  headers,
  env,
  extraOrigins = [],
  forMeta = false,
  runtimeConfig = false,
  template = false,
} = {}) {
  const resolved = resolveDeployHeaders(headers)
  const directives = {}
  for (const [name, sources] of Object.entries(BASE_CSP)) {
    if (forMeta && META_UNSUPPORTED_DIRECTIVES.has(name)) continue
    directives[name] = [...sources]
  }

  directives['font-src'].push(...resolved.fontSrc)
  directives['img-src'].push(...resolved.imgSrc)
  if (resolved.frameSrc.length > 0) directives['frame-src'] = ["'self'", ...resolved.frameSrc]
  if (!forMeta && resolved.frameAncestors.length > 0) {
    directives['frame-ancestors'] = resolved.frameAncestors
  }

  if (forMeta && runtimeConfig) {
    directives['connect-src'] = [...RUNTIME_CONFIG_META_CONNECT_SRC]
  } else if (template) {
    directives['connect-src'].push(...resolved.connectSrc, CONNECT_SRC_PLACEHOLDER)
  } else {
    const apiOrigin = connectSrcFor(apiUrl)
    directives['connect-src'].push(
      ...resolved.connectSrc,
      ...(apiOrigin ? [apiOrigin] : []),
      ...(env ? envConnectSources(resolved, env) : []),
      ...extraOrigins.map((origin, index) => originSource(origin, `extraOrigins[${index}]`)),
    )
  }

  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${[...new Set(sources)].join(' ')}`)
    .join('; ')
}

/** The CSP `<meta>` tag of a page, split around its policy. */
const CSP_META = /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")[^"]*(")/s

/**
 * `html` with the policy of its CSP `<meta>` tag replaced by `csp`, or null
 * when the page has no such tag. Only the attribute's value changes.
 */
export function replaceMetaCsp(html, csp) {
  if (/["<>\r\n]/.test(csp)) {
    throw new Error(`The CSP cannot sit in an HTML attribute: ${csp}`)
  }
  if (!CSP_META.test(html)) return null
  return html.replace(CSP_META, (_, open, close) => `${open}${csp}${close}`)
}

/**
 * `X-Frame-Options` for a `frame-ancestors` policy, or null when the old
 * header cannot say the same thing. It knows two answers, nobody and the same
 * origin; a list of other origins has no equivalent, and a `DENY` beside it
 * would contradict the policy in a browser that reads only this header.
 */
function frameOptionsFor(frameAncestors) {
  if (frameAncestors.length === 0 || frameAncestors.includes("'none'")) return 'DENY'
  if (frameAncestors.length === 1 && frameAncestors[0] === "'self'") return 'SAMEORIGIN'
  return null
}

/**
 * The full header set sent on every response. Order is stable for diffing.
 * Takes what `buildCsp` takes.
 */
export function buildSecurityHeaders(options = {}) {
  const resolved = resolveDeployHeaders(options.headers)
  const frameOptions = frameOptionsFor(resolved.frameAncestors)

  return [
    ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload'],
    ['Content-Security-Policy', buildCsp({ ...options, forMeta: false })],
    ['X-Content-Type-Options', 'nosniff'],
    ...(frameOptions ? [['X-Frame-Options', frameOptions]] : []),
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
    ['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()'],
    ['Cross-Origin-Opener-Policy', resolved.crossOriginOpenerPolicy],
    ['Cross-Origin-Resource-Policy', 'same-origin'],
  ]
}

/**
 * Cache policy per path class. Shared by every target so they cannot disagree.
 *
 * `match` is the path pattern for the hosted targets (`_headers`,
 * `vercel.json`) and `nginxLocation` the Docker image's location block. A rule
 * that leaves one of them null does not apply to that target.
 *
 * No two `match` patterns may cover the same path. A hosted platform applies
 * every rule that matches a request, and a `_headers` host joins the values of
 * a header two of them set (Cloudflare Pages documents it), so a catch-all
 * `Cache-Control` would be appended to a specific one rather than replaced by
 * it. nginx has no such problem: exactly one location serves a request.
 */
export const CACHE_RULES = [
  {
    match: '/index.html',
    nginxLocation: '= /index.html',
    headers: [['Cache-Control', 'no-cache']],
    comment:
      'Names every hashed asset, so it is revalidated on every load: a cached copy\n' +
      'would keep a returning user on the previous deploy.',
  },
  {
    match: '/assets/*',
    nginxLocation: '^~ /assets/',
    headers: [['Cache-Control', 'public, max-age=31536000, immutable']],
    comment:
      'Content-hashed by the build: a changed file gets a new name, so a cached copy\n' +
      'can never go stale. Nothing else is safe to cache forever.',
  },
  {
    match: '/version.json',
    nginxLocation: '= /version.json',
    headers: [['Cache-Control', 'no-store']],
    comment: 'Fetched to notice that a newer build is live; a cached copy would hide it.',
  },
  {
    match: '/runtime-config.js',
    nginxLocation: '= /runtime-config.js',
    // The image serves the copy its entrypoint wrote from the container's
    // environment, not the empty one the build put in the web root.
    nginxDirectives: [`alias ${RUNTIME_DIR}/runtime-config.js;`],
    headers: [['Cache-Control', 'no-store']],
    comment:
      'Written per environment rather than per build, under a name that never\n' +
      'changes, so no cache may keep a copy.',
  },
  {
    match: '/mockServiceWorker.js',
    nginxLocation: '= /mockServiceWorker.js',
    headers: [
      ['Cache-Control', 'no-cache, no-store, must-revalidate'],
      ['Service-Worker-Allowed', '/'],
    ],
    comment:
      'Not content-hashed and controls every request in the demo build — a cached\n' +
      'copy would keep serving stale mock handlers after a deploy. A production\n' +
      'build deletes the file, leaving this rule nothing to apply to.',
  },
  {
    // nginx only. A hosted platform matches headers on the request path, and a
    // pattern broad enough for these files also covers every SPA route — see
    // the note above. Those hosts keep their own default here, which
    // revalidates on every request. The generator applies these headers to two
    // blocks: `location /`, and the one that answers a missing script, image
    // or font with a 404 rather than the app.
    match: null,
    nginxLocation: '/',
    headers: [['Cache-Control', 'public, max-age=3600']],
    comment:
      'Every other file: the favicon, robots.txt, the manifest, images. None is\n' +
      'hashed, so an hour rather than forever: a replaced favicon reaches returning\n' +
      'users the same day. An SPA route is not served from here: try_files hands\n' +
      'it to /index.html, which has its own block.',
  },
]

/**
 * `CACHE_RULES` for an app served under `basePath`: the same classes of file,
 * each under the prefix. For the root it is `CACHE_RULES` itself.
 *
 * The rules name the app's own files, and those are under the base: the build
 * writes `<base>assets/…` into the page, and the image serves the build from
 * `<root>/<base>`. The mock worker may claim the base and nothing wider.
 */
export function cacheRulesFor(basePath) {
  const base = resolveBasePath(basePath)
  if (base === DEFAULT_BASE_PATH) return CACHE_RULES

  const under = (path) => `${base}${path.slice(1)}`
  return CACHE_RULES.map((rule) => ({
    ...rule,
    match: rule.match === null ? null : under(rule.match),
    nginxLocation: rule.nginxLocation.replace(/\/.*$/, (path) => under(path)),
    headers: rule.headers.map(([name, value]) =>
      name === 'Service-Worker-Allowed' ? [name, base] : [name, value],
    ),
  }))
}

/** Marker written into every generated file so nobody hand-edits one. */
export const GENERATED_BANNER =
  'GENERATED by scripts/security/sync-headers.mjs — do not edit by hand.\n' +
  'Edit scripts/security/headers.mjs and run `vpr security:headers`.'
