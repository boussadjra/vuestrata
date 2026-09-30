#!/usr/bin/env node
/**
 * Renders the canonical security headers into every place that serves them.
 *
 * Targets:
 *   public/_headers               — static hosts reading Netlify-style files
 *   vercel.json                   — the `headers` array; the rest is untouched
 *   docker/nginx.conf             — the image's server block
 *   docker/security-headers.conf  — the snippet each location includes
 *   index.html                    — the CSP `<meta http-equiv>` tag
 *
 * Usage:
 *   node scripts/security/sync-headers.mjs            # write all targets
 *   node scripts/security/sync-headers.mjs --check    # fail if any has drifted
 *   node scripts/security/sync-headers.mjs --api-url=https://api.acme.com
 *
 * `--check` runs in `vpr lint` and CI. It is the piece that was missing: the
 * four copies were previously kept in step by comments asking the next person
 * to remember, which is not a mechanism.
 *
 * `--api-url` widens `connect-src` for a cross-origin backend, and decides
 * whether nginx answers an unrouted same-origin API path. The COMMITTED files
 * are generated for the default same-origin `/api`; a deployment with a
 * separate API origin re-runs this during its build (the Dockerfile does).
 *
 * The renderers are exported for the unit tests. The CLI runs only when this
 * file is the entry point, so importing it writes nothing.
 */
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { consola } from 'consola'

import {
  buildCsp,
  buildSecurityHeaders,
  CACHE_RULES,
  DEFAULT_API_URL,
  GENERATED_BANNER,
  sameOriginApiPath,
} from './headers.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const logger = consola.withTag('security-headers')

const NL = '\n'

/** The generated-file banner, prefixed for `#`-comment formats. */
function hashBanner() {
  return GENERATED_BANNER.split(NL)
    .map((line) => `# ${line}`)
    .join(NL)
}

/** A multi-line rule comment as `#` lines, or nothing when there is none. */
function hashComment(comment, indent = '') {
  return comment ? comment.split(NL).map((line) => `${indent}# ${line}`) : []
}

// ─── Renderers ───────────────────────────────────────────────────────────────

export function renderHeadersFile({ apiUrl = DEFAULT_API_URL } = {}) {
  const lines = [hashBanner(), '', '/*']
  lines.push(...buildSecurityHeaders({ apiUrl }).map(([name, value]) => `  ${name}: ${value}`))

  for (const rule of CACHE_RULES) {
    if (!rule.match) continue
    lines.push('', ...hashComment(rule.comment), rule.match)
    lines.push(...rule.headers.map(([name, value]) => `  ${name}: ${value}`))
  }

  return `${lines.join(NL)}${NL}`
}

/** A `_headers` path as a Vercel `source`: dots literal, a trailing `*` a wildcard. */
function vercelSource(match) {
  return match.replaceAll('.', '\\.').replace(/\*$/, '(.*)')
}

export function renderVercelHeaders({ apiUrl = DEFAULT_API_URL } = {}) {
  return [
    {
      source: '/(.*)',
      headers: buildSecurityHeaders({ apiUrl }).map(([key, value]) => ({ key, value })),
    },
    ...CACHE_RULES.filter((rule) => rule.match).map((rule) => ({
      source: vercelSource(rule.match),
      headers: rule.headers.map(([key, value]) => ({ key, value })),
    })),
  ]
}

/**
 * The security headers as an includable nginx snippet.
 *
 * This is not a stylistic choice. nginx inherits `add_header` from an outer
 * level ONLY IF the inner level declares no `add_header` of its own — so a
 * single `Cache-Control` inside `location /` silently drops every security
 * header set on `server`. The previous inline config did exactly that, which
 * meant the CSP, HSTS and frame-options headers were absent from every HTML
 * response the app actually served. Re-including them per location is what
 * makes them apply.
 */
export function renderNginxHeadersSnippet({ apiUrl = DEFAULT_API_URL } = {}) {
  const lines = [
    hashBanner(),
    '#',
    '# Included in EVERY location block on purpose: nginx drops inherited',
    '# add_header directives as soon as a block declares one of its own.',
    ...buildSecurityHeaders({ apiUrl }).map(
      ([name, value]) => `add_header ${name} "${value}" always;`,
    ),
  ]
  return `${lines.join(NL)}${NL}`
}

const SNIPPET = '/etc/nginx/snippets/security-headers.conf'

/**
 * What nginx compresses on the fly. Without a list it compresses text/html and
 * nothing else. Both JavaScript types are listed: nginx's own mime.types says
 * application/javascript, and RFC 9239 made text/javascript the standard one.
 */
const GZIP_TYPES = [
  'text/plain',
  'text/css',
  'text/javascript',
  'application/javascript',
  'application/json',
  'application/wasm',
  'image/svg+xml',
]

/**
 * One location block. Every block re-includes the header snippet — see
 * `renderNginxHeadersSnippet` for why none may rely on inheriting it. `reply`
 * goes last for the reader only: nginx adds `add_header` values to a `return`
 * response wherever the two sit in the block.
 *
 * The block's own headers leave out `always` unless asked for it, so nginx
 * adds them to success and redirect responses only. A cache lifetime on an
 * error is a bug: a hashed chunk requested mid-deploy from a server that does
 * not have it yet would otherwise be kept as an immutable 404 for a year.
 */
function nginxLocation(
  location,
  { comment, directives = [], headers = [], always = false, reply },
) {
  const flag = always ? ' always' : ''
  return [
    ...hashComment(comment, '  '),
    `  location ${location} {`,
    ...directives.map((directive) => `    ${directive}`),
    `    include ${SNIPPET};`,
    ...headers.map(([name, value]) => `    add_header ${name} "${value}"${flag};`),
    ...(reply ? [`    ${reply}`] : []),
    '  }',
  ]
}

/**
 * The body of the 502 for an unrouted API path. `code` is the field the app's
 * API client reads into its error, so the console names this failure instead
 * of reporting a bare 502.
 *
 * nginx reads it inside a single-quoted string, where `'` would end the
 * string, `$` start a variable and `\` an escape. None may appear, and a
 * message edited to contain one fails the generation rather than the
 * container start.
 */
function apiNotRoutedBody(apiPath) {
  const body = JSON.stringify({
    error: 'api_not_routed',
    code: 'API_NOT_ROUTED',
    message:
      `No backend is routed at ${apiPath}/. Route it to your API at the ingress or ` +
      'reverse proxy in front of this container.',
  })
  if (/['$\\]/.test(body)) {
    throw new Error(`The unrouted-API response body cannot sit in a quoted nginx string: ${body}`)
  }
  return body
}

/**
 * Scripts, stylesheets, images and fonts: paths that name a file rather than
 * an SPA route. The list stays short on purpose, because a deep link to a
 * route whose last segment ends in one of these (`/files/logo.png`) would 404
 * on reload.
 */
const STATIC_FILE_LOCATION = '~* \\.(?:js|mjs|css|png|jpe?g|gif|ico|svg|webp|avif|woff2?|ttf|otf)$'

export function renderNginxConf({ apiUrl = DEFAULT_API_URL } = {}) {
  const apiPath = sameOriginApiPath(apiUrl)

  const blocks = [
    nginxLocation('= /healthz', {
      comment:
        'Liveness and readiness probe. nginx answers it alone, so it reports whether\n' +
        'the server is up without fetching the app, and stays out of an access log a\n' +
        'probe every few seconds would otherwise fill.',
      directives: ['access_log off;', 'default_type text/plain;'],
      headers: [['Cache-Control', 'no-store']],
      reply: 'return 200 "ok";',
    }),
  ]

  if (apiPath) {
    const unrouted = {
      // `types { }` empties the extension-to-type map, so default_type applies
      // to every path: /api/export.html would otherwise go out as text/html.
      directives: ['types { }', 'default_type application/json;'],
      headers: [['Cache-Control', 'no-store']],
      // The error is the whole response here, and 502 is not a status
      // nginx adds headers to by default.
      always: true,
      reply: `return 502 '${apiNotRoutedBody(apiPath)}';`,
    }
    blocks.push(
      nginxLocation(`^~ ${apiPath}/`, {
        ...unrouted,
        comment:
          `The app calls its API at ${apiPath}/ on this origin (VUESTRATA_API_URL). Routing\n` +
          'that path to the backend is the job of the ingress or reverse proxy in front\n' +
          'of this container, not of this server. When nothing routes it, the SPA\n' +
          'fallback below would answer an API call with index.html (a 200 for a GET, a\n' +
          '405 for a POST) and the app would fail far from the cause. This names it.',
      }),
      nginxLocation(`= ${apiPath}`, {
        ...unrouted,
        comment: `${apiPath} itself, which the prefix block above does not match.`,
      }),
    )
  }

  for (const rule of CACHE_RULES) {
    if (!rule.nginxLocation) continue
    const isCatchAll = rule.nginxLocation === '/'

    blocks.push(
      nginxLocation(rule.nginxLocation, {
        comment: rule.comment,
        // The SPA fallback belongs to the catch-all; its rule says why that
        // does not put routes under the catch-all's cache policy.
        directives: isCatchAll ? ['try_files $uri $uri/ /index.html;'] : [],
        headers: rule.headers,
      }),
    )

    // The catch-all's policy also covers files with a static extension, in a
    // block of their own so that a missing one is a 404.
    if (isCatchAll) {
      blocks.push(
        nginxLocation(STATIC_FILE_LOCATION, {
          comment:
            'Scripts, stylesheets, images and fonts get the same hour, but a missing one\n' +
            'is a 404: through the fallback above, a stale image link or a removed script\n' +
            'would get index.html with a 200, and nothing would look broken. A matching\n' +
            'regex beats the `/` prefix; the exact and ^~ locations still beat the regex.',
          directives: ['try_files $uri =404;'],
          headers: rule.headers,
        }),
      )
    }
  }

  const lines = [
    hashBanner(),
    '',
    'server {',
    '  listen 8080;',
    '  root /usr/share/nginx/html;',
    '  index index.html;',
    '  server_tokens off;',
    '',
    '  # Applies to responses served by this level directly (errors, redirects).',
    '  # Every location below re-includes it — see the note in the snippet.',
    `  include ${SNIPPET};`,
    '',
    '  # The image gzips its text assets once, at build time, and gzip_static sends',
    '  # those .gz files as they are; `gzip` compresses the rest on the fly.',
    '  # `gzip_proxied any` keeps both on behind a load balancer: by default nginx',
    '  # compresses nothing for a request that arrives with a Via header.',
    '  gzip on;',
    '  gzip_static on;',
    '  gzip_vary on;',
    '  gzip_proxied any;',
    '  gzip_comp_level 6;',
    '  gzip_min_length 1024;',
    `  gzip_types ${GZIP_TYPES.join(' ')};`,
    ...blocks.flatMap((block) => ['', ...block]),
    '}',
  ]
  return `${lines.join(NL)}${NL}`
}

/** `index.html` with its CSP `<meta>` rewritten. */
export function renderIndexHtml(current, { apiUrl = DEFAULT_API_URL } = {}) {
  // `frame-ancestors` is omitted: a <meta> tag cannot express it.
  const csp = buildCsp({ apiUrl, forMeta: true })
  const pattern = /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")[^"]*(")/s
  if (!pattern.test(current)) {
    throw new Error(
      'Could not find the Content-Security-Policy <meta> tag in index.html. ' +
        'If it was renamed or reformatted, update the pattern in sync-headers.mjs.',
    )
  }
  return current.replace(pattern, `$1${csp}$2`)
}

// ─── Targets ─────────────────────────────────────────────────────────────────

/**
 * Each target reads its current content and returns the desired content.
 * Identical strings mean "in sync".
 */
function targetsFor(apiUrl) {
  return [
    { path: 'public/_headers', render: () => renderHeadersFile({ apiUrl }) },
    { path: 'docker/nginx.conf', render: () => renderNginxConf({ apiUrl }) },
    { path: 'docker/security-headers.conf', render: () => renderNginxHeadersSnippet({ apiUrl }) },
    {
      path: 'vercel.json',
      render: (current) => {
        const config = JSON.parse(current)
        config.headers = renderVercelHeaders({ apiUrl })
        return `${JSON.stringify(config, null, 2)}${NL}`
      },
    },
    { path: 'index.html', render: (current) => renderIndexHtml(current, { apiUrl }) },
  ]
}

// ─── Run ─────────────────────────────────────────────────────────────────────

/**
 * `--api-url=<value>`. Empty means the default, as it does for the app: the
 * Dockerfile passes its build arg through even when someone set it to "".
 */
function parseApiUrl(args) {
  const value = args
    .find((arg) => arg.startsWith('--api-url='))
    ?.slice('--api-url='.length)
    .trim()
  return value || DEFAULT_API_URL
}

function run(args) {
  const checkOnly = args.includes('--check')
  const apiUrl = parseApiUrl(args)

  let drifted = 0

  for (const target of targetsFor(apiUrl)) {
    const fullPath = resolve(root, target.path)

    let current = ''
    try {
      current = readFileSync(fullPath, 'utf8')
    } catch {
      if (checkOnly) {
        logger.error(`${target.path} is missing.`)
        drifted += 1
        continue
      }
    }

    let desired
    try {
      desired = target.render(current)
    } catch (error) {
      logger.error(`${target.path}: ${error.message}`)
      process.exit(1)
    }

    if (current === desired) {
      if (!checkOnly) logger.success(`${target.path} is up to date`)
      continue
    }

    if (checkOnly) {
      logger.error(`${target.path} has drifted from scripts/security/headers.mjs`)
      drifted += 1
      continue
    }

    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, desired)
    logger.success(`${target.path} updated`)
  }

  if (checkOnly && drifted > 0) {
    logger.error(
      `${drifted} security-header target(s) out of sync.\n` +
        `The headers are defined once in scripts/security/headers.mjs. Regenerate with:\n` +
        `  vpr security:headers`,
    )
    process.exit(1)
  }

  if (checkOnly) {
    logger.success('All security-header targets match scripts/security/headers.mjs')
  }
}

/**
 * True when node was pointed at this file, false when something imported it.
 *
 * A false negative here would be silent in the worst way: `--check` would
 * exit 0 without checking anything. Both sides are compared as real paths
 * because node resolves symlinks in the entry module's URL but leaves
 * `process.argv[1]` as typed.
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

if (isEntryPoint()) run(process.argv.slice(2))
