/**
 * The canonical security-header set. One definition, four consumers.
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
 * The app's own default for `VUESTRATA_API_URL` (see `env.schema.ts`). A build
 * that sets nothing must get headers and an nginx config for the URL the app
 * will actually call.
 */
export const DEFAULT_API_URL = '/api'

/**
 * Turn an API URL into a CSP `connect-src` source.
 *
 * A same-origin path (`/api`, the reverse-proxy setup) needs nothing beyond
 * `'self'`. A cross-origin API needs its ORIGIN — scheme, host and port, with
 * no path. This is the single most common way to get a CSP wrong: a path is
 * not a valid CSP source, and ONE invalid source makes the browser discard the
 * entire directive, so `connect-src 'self' https://api.example.com/v1` silently
 * provides no protection at all rather than failing loudly.
 */
export function connectSrcFor(apiUrl) {
  if (!apiUrl || apiUrl.startsWith('/')) return null

  let parsed
  try {
    parsed = new URL(apiUrl)
  } catch {
    throw new Error(
      `Cannot derive a CSP connect-src from VUESTRATA_API_URL="${apiUrl}": ` +
        `it is neither an absolute URL nor a same-origin path starting with "/".`,
    )
  }
  return parsed.origin
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
 * that can neither end a directive nor start a variable. Anything else fails
 * here, during the build, rather than as an nginx syntax error when the
 * container starts.
 */
export function sameOriginApiPath(apiUrl) {
  if (!apiUrl?.startsWith('/')) return null

  const path = apiUrl.replace(/\/+$/, '')
  if (path === '') return null

  if (!/^(?:\/[\w.~-]+)+$/.test(path)) {
    throw new Error(
      `Cannot route VUESTRATA_API_URL="${apiUrl}" in nginx: a same-origin API path must be ` +
        `"/" followed by segments of letters, digits and "._~-".`,
    )
  }
  return path
}

/**
 * Build the CSP string.
 *
 * `apiUrl` widens `connect-src` when the backend is cross-origin. Everything
 * else is fixed.
 */
export function buildCsp({ apiUrl = DEFAULT_API_URL, forMeta = false } = {}) {
  const directives = {}
  for (const [name, sources] of Object.entries(BASE_CSP)) {
    if (forMeta && META_UNSUPPORTED_DIRECTIVES.has(name)) continue
    directives[name] = [...sources]
  }

  const apiOrigin = connectSrcFor(apiUrl)
  if (apiOrigin && !directives['connect-src'].includes(apiOrigin)) {
    directives['connect-src'].push(apiOrigin)
  }

  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(' ')}`)
    .join('; ')
}

/** The full header set sent on every response. Order is stable for diffing. */
export function buildSecurityHeaders({ apiUrl = DEFAULT_API_URL } = {}) {
  return [
    ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload'],
    ['Content-Security-Policy', buildCsp({ apiUrl })],
    ['X-Content-Type-Options', 'nosniff'],
    ['X-Frame-Options', 'DENY'],
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
    ['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()'],
    ['Cross-Origin-Opener-Policy', 'same-origin'],
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
    // revalidates on every request.
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

/** Marker written into every generated file so nobody hand-edits one. */
export const GENERATED_BANNER =
  'GENERATED by scripts/security/sync-headers.mjs — do not edit by hand.\n' +
  'Edit scripts/security/headers.mjs and run `vpr security:headers`.'
