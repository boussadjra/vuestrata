#!/usr/bin/env node
/**
 * Renders the canonical security headers into every place that serves them.
 *
 * Targets:
 *   public/_headers                                — static hosts reading Netlify-style files
 *   vercel.json                                    — the `headers` array; the rest is untouched
 *   index.html                                     — the CSP `<meta http-equiv>` tag
 *   docker/nginx.conf                              — the image's server block
 *   docker/runtime/security-headers.conf.template  — the snippet each location includes
 *   docker/runtime/api-location.conf.template      — the answer to an unrouted API path
 *   docker/runtime/keys                            — what the entrypoint reads from the environment
 *
 * Usage:
 *   node scripts/security/sync-headers.mjs              # write all targets
 *   node scripts/security/sync-headers.mjs --check      # fail if any has drifted
 *   node scripts/security/sync-headers.mjs --from-env   # render for THIS environment
 *   node scripts/security/sync-headers.mjs --api-url=https://api.acme.com
 *   node scripts/security/sync-headers.mjs --runtime-config   # for an artifact configured at start
 *
 * Inputs, the same for writing and for `--check`:
 *   - `scripts/security/headers.mjs`, the defaults;
 *   - `headers` and `runtime` in `src/modules/app/config/deploy.config.ts`, what
 *     the project adds. A policy widened there is what the check expects, so
 *     committing it passes.
 *
 * `--check` runs in `vpr lint` and CI. It is the piece that was missing: the
 * copies were previously kept in step by comments asking the next person to
 * remember, which is not a mechanism.
 *
 * The COMMITTED files are generated for the default same-origin `/api` and
 * read nothing from the environment, so the check gives the same answer on
 * every machine. Two kinds of deployment need more than that:
 *
 *   - The Docker image decides at container START. Its three `docker/runtime`
 *     files are templates, and `docker/entrypoint.d/40-vuestrata-runtime.sh`
 *     fills them from the container's environment. The two templates never
 *     depend on the flags below.
 *   - A static host has no start. `--from-env` renders `public/_headers`, the
 *     `vercel.json` block and the CSP `<meta>` of `index.html` from the build's
 *     environment: the origin of `VUESTRATA_API_URL` and of every variable
 *     `deploy.config.ts` names under `connectSrcFromEnv` / `websocketFromEnv`.
 *     Run it in the deploy pipeline, before `vp build`, and do not commit the
 *     result: it differs per environment by design, and `--check` would report
 *     it as drift. `--api-url` sets the API URL alone.
 *
 * The `<meta>` carries the same `connect-src` as the header, so a host that
 * sends no headers is still held to it. `--runtime-config` is for an artifact
 * whose API URL is set when it STARTS, through `runtime-config.js`, which the
 * page cannot know when it is written:
 *
 *   - the `<meta>` reads `connect-src *`, leaving connections to the header
 *     alone. A browser enforces the tag in addition to the header, so the
 *     narrow one would block an origin the header allows;
 *   - `docker/runtime/keys` records the API URL of this build (`--api-url`),
 *     which the entrypoint falls back to for a container started without one.
 *
 * The Dockerfile passes it. A static host whose deploy step writes its own
 * `dist/runtime-config.js` with another API origin passes it too, or renders
 * with `--from-env` so that the tag and `_headers` both name that origin.
 * `--check` ignores the flag: what is committed is the form without it.
 *
 * The renderers are exported for the unit tests. The CLI runs only when this
 * file is the entry point, so importing it writes nothing.
 */
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { consola } from 'consola'

import { loadDeployConfig, loadRuntimeKeys } from './deploy-config.mjs'
import {
  API_PATH_PLACEHOLDER,
  buildCsp,
  buildSecurityHeaders,
  CACHE_RULES,
  connectSrcFor,
  DEFAULT_API_URL,
  GENERATED_BANNER,
  HEALTH_PATH,
  replaceMetaCsp,
  reservedApiPaths,
  resolveDeployHeaders,
  resolveRuntimeKeys,
  RUNTIME_DIR,
  sameOriginApiPath,
} from './headers.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const logger = consola.withTag('security-headers')

const NL = '\n'

/** The variable the app reads its API URL from. */
const API_URL_KEY = 'VUESTRATA_API_URL'

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

/**
 * A header value about to be written inside a double-quoted nginx string.
 *
 * nginx ends that string at `"`, expands `$name` as a variable and reads `\`
 * as an escape. Every source is validated long before it gets here; this is
 * the last line, so a value that could change the meaning of the config fails
 * the generation instead of reaching a server.
 */
function nginxQuoted(name, value) {
  if (/["$\\\r\n]/.test(value)) {
    throw new Error(`The ${name} header cannot sit in a quoted nginx string: ${value}`)
  }
  return value
}

/** A header value about to be written on one line of a `_headers` file. */
function singleLine(name, value) {
  if (/[\r\n]/.test(value)) throw new Error(`The ${name} header spans more than one line.`)
  return value
}

// ─── Renderers ───────────────────────────────────────────────────────────────
//
// Each takes what `buildSecurityHeaders` takes: `{ apiUrl, headers, env }`.

export function renderHeadersFile(options = {}) {
  const lines = [hashBanner(), '', '/*']
  lines.push(
    ...buildSecurityHeaders(options).map(
      ([name, value]) => `  ${name}: ${singleLine(name, value)}`,
    ),
  )

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

export function renderVercelHeaders(options = {}) {
  return [
    {
      source: '/(.*)',
      headers: buildSecurityHeaders(options).map(([key, value]) => ({ key, value })),
    },
    ...CACHE_RULES.filter((rule) => rule.match).map((rule) => ({
      source: vercelSource(rule.match),
      headers: rule.headers.map(([key, value]) => ({ key, value })),
    })),
  ]
}

/** The header set as `add_header` lines under the generated banner. */
function nginxHeaderLines(headers, note = []) {
  const lines = [
    hashBanner(),
    '#',
    '# Included in EVERY location block on purpose: nginx drops inherited',
    '# add_header directives as soon as a block declares one of its own.',
    ...note,
    ...headers.map(([name, value]) => `add_header ${name} "${nginxQuoted(name, value)}" always;`),
  ]
  return `${lines.join(NL)}${NL}`
}

/**
 * The security headers as an includable nginx snippet, for one environment.
 *
 * This is not a stylistic choice. nginx inherits `add_header` from an outer
 * level ONLY IF the inner level declares no `add_header` of its own — so a
 * single `Cache-Control` inside `location /` silently drops every security
 * header set on `server`. The previous inline config did exactly that, which
 * meant the CSP, HSTS and frame-options headers were absent from every HTML
 * response the app actually served. Re-including them per location is what
 * makes them apply.
 *
 * No file holds this output: the image ships the template below and its
 * entrypoint renders the snippet at container start. It is exported as the
 * reference the entrypoint is tested against.
 */
export function renderNginxHeadersSnippet(options = {}) {
  return nginxHeaderLines(buildSecurityHeaders(options))
}

/**
 * The snippet with `connect-src` left open: what is known when the image is
 * built, then a placeholder. `docker/entrypoint.d/40-vuestrata-runtime.sh`
 * replaces the placeholder — and the space before it — with the origins it
 * derives from the container's environment, and writes the result where the
 * server block includes it from.
 *
 * Nothing here depends on the environment the generator runs in, so one image
 * serves every environment and the committed file never drifts with it.
 */
export function renderNginxHeadersTemplate({ headers } = {}) {
  return nginxHeaderLines(
    buildSecurityHeaders({ headers, template: true }),
    templateNote(
      'A TEMPLATE, not the snippet nginx reads. When the container starts,',
      'docker/entrypoint.d/40-vuestrata-runtime.sh copies it without these lines and',
      "ends connect-src with the origins the container's environment names",
      '(docker/runtime/keys).',
    ),
  )
}

/**
 * The lines that say a file is a template. The entrypoint drops every line
 * starting with this prefix, so what it renders is exactly what the generator
 * would have rendered for that environment — and no rendered file claims to be
 * a template, or carries a comment a substitution has rewritten.
 */
const TEMPLATE_NOTE = '#@template'

function templateNote(...lines) {
  return lines.map((line) => `${TEMPLATE_NOTE} ${line}`)
}

const SNIPPET = `${RUNTIME_DIR}/security-headers.conf`
const API_LOCATION = `${RUNTIME_DIR}/api-location.conf`

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
 * The two location blocks that answer a same-origin API path nothing routes.
 *
 * `apiPath` is the prefix without its trailing slash (`sameOriginApiPath`).
 * The image does not know it when it is built — `VUESTRATA_API_URL` is read at
 * container start — so what ships is `renderApiLocationTemplate()`, this with
 * a placeholder for the path. Exported as the reference the entrypoint is
 * tested against.
 */
export function renderApiLocation(apiPath) {
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

  const blocks = [
    nginxLocation(`^~ ${apiPath}/`, {
      ...unrouted,
      comment:
        `The app calls its API at ${apiPath}/ on this origin (VUESTRATA_API_URL). Routing\n` +
        'that path to the backend is the job of the ingress or reverse proxy in front\n' +
        'of this container, not of this server. When nothing routes it, the SPA\n' +
        'fallback would answer an API call with index.html (a 200 for a GET, a 405\n' +
        'for a POST) and the app would fail far from the cause. This names it.',
    }),
    nginxLocation(`= ${apiPath}`, {
      ...unrouted,
      comment: `${apiPath} itself, which the prefix block above does not match.`,
    }),
  ]
  return blocks.map((block) => block.join(NL)).join(`${NL}${NL}`)
}

/**
 * `renderApiLocation` for a path decided at container start.
 *
 * The entrypoint writes the rendered blocks when `VUESTRATA_API_URL` is a
 * same-origin path, and an empty file when the API is on another origin or at
 * `/`, where no prefix separates its requests from the app's own.
 */
export function renderApiLocationTemplate() {
  const lines = [
    hashBanner(),
    ...templateNote(
      'A TEMPLATE, not the file nginx reads. When the container starts,',
      'docker/entrypoint.d/40-vuestrata-runtime.sh copies it without these lines,',
      'with the path of a same-origin VUESTRATA_API_URL in place of the placeholder.',
      'For an API on another origin it writes an empty file instead, and the server',
      'block has no such location.',
    ),
    '',
    renderApiLocation(API_PATH_PLACEHOLDER),
  ]
  return `${lines.join(NL)}${NL}`
}

/**
 * Scripts, stylesheets, images and fonts: paths that name a file rather than
 * an SPA route. The list stays short on purpose, because a deep link to a
 * route whose last segment ends in one of these (`/files/logo.png`) would 404
 * on reload.
 */
const STATIC_FILE_LOCATION = '~* \\.(?:js|mjs|css|png|jpe?g|gif|ico|svg|webp|avif|woff2?|ttf|otf)$'

/**
 * The image's server block. It is the same for every environment: what varies
 * is in the two files it includes from the entrypoint's output directory.
 */
export function renderNginxConf() {
  const blocks = [
    nginxLocation(`= ${HEALTH_PATH}`, {
      comment:
        'Liveness and readiness probe. nginx answers it alone, so it reports whether\n' +
        'the server is up without fetching the app, and stays out of an access log a\n' +
        'probe every few seconds would otherwise fill.',
      directives: ['access_log off;', 'default_type text/plain;'],
      headers: [['Cache-Control', 'no-store']],
      reply: 'return 200 "ok";',
    }),
    [
      '  # The answer to a same-origin API path that nothing routes: a JSON 502',
      '  # instead of the SPA fallback. Whether there is one, and at which path,',
      '  # follows VUESTRATA_API_URL in the container environment, so the',
      '  # entrypoint writes this file (docker/runtime/api-location.conf.template).',
      `  include ${API_LOCATION};`,
    ],
  ]

  for (const rule of CACHE_RULES) {
    if (!rule.nginxLocation) continue
    const isCatchAll = rule.nginxLocation === '/'

    blocks.push(
      nginxLocation(rule.nginxLocation, {
        comment: rule.comment,
        // The SPA fallback belongs to the catch-all; its rule says why that
        // does not put routes under the catch-all's cache policy.
        directives: isCatchAll ? ['try_files $uri $uri/ /index.html;'] : rule.nginxDirectives,
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
    '  #',
    `  # It is read from ${RUNTIME_DIR}, where the entrypoint renders it from the`,
    "  # container's environment (docker/entrypoint.d/40-vuestrata-runtime.sh). A",
    '  # container whose entrypoint did not run has no such file, and nginx refuses',
    '  # to start rather than serve the app without its headers.',
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

/**
 * What the entrypoint reads from the container's environment, one entry per
 * line: a purpose, then the variable.
 *
 * The entrypoint holds no variable names of its own. This file is its whole
 * knowledge of them, generated from the same two lists the browser and the
 * headers use — `RUNTIME_OVERRIDABLE_KEYS` and `deploy.config.ts` — so the
 * three cannot disagree about what a deployment may set.
 */
export function renderRuntimeKeys({
  headers,
  runtimeKeys = [],
  runtimeKeyFormats = {},
  buildApiUrl = DEFAULT_API_URL,
} = {}) {
  const resolved = resolveDeployHeaders(headers)
  const lines = [
    hashBanner(),
    '#',
    '# What docker/entrypoint.d/40-vuestrata-runtime.sh reads from the environment',
    '# of the container. One entry per line: what it is for, then the variable.',
    '#',
    '#   config     written to /runtime-config.js, where the app reads it',
    '#   text       the same, and the value may hold spaces; it is written to no',
    '#              other file',
    '#   enum       the same, and the value must be one of those listed',
    '#   api        the API URL: its origin joins connect-src, or its path gets the',
    '#              unrouted-API answer; the third field is the URL the app was',
    '#              built with, which applies when the variable is unset or empty',
    '#   connect    its origin joins connect-src',
    '#   websocket  the ws(s):// form of its origin joins connect-src',
    '#   reserved   not a variable: a path the server answers itself, which the',
    '#              API path therefore cannot be',
    ...resolveRuntimeKeys(runtimeKeys).map((key) => configEntry(key, runtimeKeyFormats[key])),
    `api ${API_URL_KEY} ${entrypointApiUrl(buildApiUrl)}`,
    ...resolved.connectSrcFromEnv.map((key) => `connect ${key}`),
    ...resolved.websocketFromEnv.map((key) => `websocket ${key}`),
    ...reservedApiPaths().map((path) => `reserved ${path}`),
  ]
  return `${lines.join(NL)}${NL}`
}

/** What one value of an `enum` entry may be: a word the entrypoint's own check lets through. */
const ENUM_VALUE = /^[A-Za-z0-9_.~-]+$/

/**
 * The entry that puts `key` into runtime-config.js. `format` comes from
 * `RUNTIME_KEY_FORMATS`; a key without one is held to the URL-safe set.
 */
function configEntry(key, format) {
  if (format === undefined) return `config ${key}`
  if (format.kind === 'text') return `text ${key}`
  if (
    format.kind === 'enum' &&
    Array.isArray(format.values) &&
    format.values.length > 0 &&
    format.values.every((value) => typeof value === 'string' && ENUM_VALUE.test(value))
  ) {
    return `enum ${key} ${format.values.join(' ')}`
  }
  throw new Error(`${key}: ${JSON.stringify(format)} is not a runtime key format.`)
}

/** The characters the entrypoint accepts in a value, and the length it stops at. */
const ENTRYPOINT_VALUE = /^[A-Za-z0-9_.~:/?#@&+,=%-]{1,2048}$/

/**
 * The API URL of this build, as the entrypoint's fallback. It goes through the
 * checks the entrypoint will apply to it, so an image whose own default would
 * stop every container fails here, at build, instead.
 */
function entrypointApiUrl(apiUrl) {
  if (typeof apiUrl !== 'string' || !ENTRYPOINT_VALUE.test(apiUrl)) {
    throw new Error(
      `${API_URL_KEY}=${JSON.stringify(apiUrl)} cannot be the default of a container: it may ` +
        'hold only letters, digits and -_.~:/?#@&+,=% (percent-encode the rest).',
    )
  }
  if (apiUrl.startsWith('/')) sameOriginApiPath(apiUrl)
  else connectSrcFor(apiUrl)
  return apiUrl
}

// ─── index.html ──────────────────────────────────────────────────────────────

/** How a comment this generator wrote above the CSP `<meta>` begins. */
const META_COMMENT_MARKER = 'GENERATED by scripts/security/sync-headers.mjs'

/**
 * A comment above the tag that is this generator's to replace: one it wrote,
 * or one of the two hand-written ones every project started with. Those said
 * to keep four copies in sync by hand and that everything else was locked
 * down, and stopped being true the day the copies became generated.
 */
const OWNED_META_COMMENT = new RegExp(
  `^\\s*(?:${META_COMMENT_MARKER.replaceAll('.', '\\.')}|CSP defense-in-depth|Baseline CSP for environments)`,
)

/** The comment written above the tag. It describes the tag, so it is rendered with it. */
function metaComment(runtimeConfig) {
  return [
    `${META_COMMENT_MARKER}, like the tag below.`,
    'Edit neither by hand: change src/modules/app/config/deploy.config.ts and',
    'run `vpr security:headers`.',
    '',
    'This is the policy for a host that sends no headers. Where the HTTP header',
    'is sent (vercel.json, public/_headers, the Docker image), the header is the',
    'authority, and a browser enforces this tag in addition to it.',
    '',
    'It differs from the header in one way: `frame-ancestors` is absent, because',
    'a browser ignores it in a <meta> tag. Only a header stops another site from',
    'framing the app.',
    ...(runtimeConfig
      ? [
          '',
          '`connect-src *`: this page belongs to an artifact whose API URL is set',
          'when it starts, so the header alone restricts what it connects to.',
        ]
      : []),
    '',
    "`style-src 'unsafe-inline'` is there for Tailwind and Vue, which inject",
    'style elements at runtime.',
  ]
}

const CSP_META_TAG = /<meta\s+http-equiv="Content-Security-Policy"/

/**
 * `html` with the generator's comment directly above the CSP `<meta>`, in
 * place of any comment there that is the generator's to replace. A comment a
 * project wrote itself is left where it is.
 */
function withMetaComment(html, runtimeConfig) {
  const eol = html.includes('\r\n') ? '\r\n' : NL
  let page = html
  let tag = page.search(CSP_META_TAG)

  // Walk up through the comments that sit directly above the tag, taking out
  // each one that is the generator's, with the whitespace after it.
  let cursor = tag
  for (;;) {
    const comment = /<!--((?:(?!-->)[\s\S])*)-->\s*$/.exec(page.slice(0, cursor))
    if (!comment) break
    if (OWNED_META_COMMENT.test(comment[1])) {
      page = page.slice(0, comment.index) + page.slice(cursor)
      tag -= cursor - comment.index
    }
    cursor = comment.index
  }

  const indent = /[ \t]*$/.exec(page.slice(0, tag))[0]
  const lines = [
    '<!--',
    ...metaComment(runtimeConfig).map((line) => (line ? `${indent}  ${line}` : '')),
    `${indent}-->`,
  ]
  return `${page.slice(0, tag)}${lines.join(eol)}${eol}${indent}${page.slice(tag)}`
}

/**
 * `index.html` with its CSP `<meta>` rewritten, and the comment above it.
 *
 * Takes what `buildSecurityHeaders` takes, so the tag names the same origins
 * as the header, and `runtimeConfig` for the one artifact where it cannot (see
 * RUNTIME_CONFIG_META_CONNECT_SRC in headers.mjs). `frame-ancestors` is left
 * out either way: a <meta> tag cannot express it.
 */
export function renderIndexHtml(current, { apiUrl, headers, env, runtimeConfig = false } = {}) {
  const csp = buildCsp({ apiUrl, headers, env, forMeta: true, runtimeConfig })
  const page = replaceMetaCsp(current, csp)
  if (page === null) {
    throw new Error(
      'Could not find the Content-Security-Policy <meta> tag in index.html. ' +
        'If it was renamed or reformatted, update the pattern in headers.mjs.',
    )
  }
  return withMetaComment(page, runtimeConfig)
}

// ─── Targets ─────────────────────────────────────────────────────────────────

/**
 * Each target reads its current content and returns the desired content.
 * Identical strings mean "in sync".
 */
function targetsFor(options) {
  return [
    { path: 'public/_headers', render: () => renderHeadersFile(options) },
    { path: 'docker/nginx.conf', render: () => renderNginxConf() },
    {
      path: 'docker/runtime/security-headers.conf.template',
      render: () => renderNginxHeadersTemplate(options),
    },
    {
      path: 'docker/runtime/api-location.conf.template',
      render: () => renderApiLocationTemplate(),
    },
    { path: 'docker/runtime/keys', render: () => renderRuntimeKeys(options) },
    {
      path: 'vercel.json',
      render: (current) => {
        const config = JSON.parse(current)
        config.headers = renderVercelHeaders(options)
        return `${JSON.stringify(config, null, 2)}${NL}`
      },
    },
    { path: 'index.html', render: (current) => renderIndexHtml(current, options) },
  ]
}

/**
 * Files an earlier version of this generator wrote and no version reads any
 * more. Only a copy that still carries the generated banner is touched: a file
 * a project wrote under the same name is not this generator's to remove.
 */
const OBSOLETE_TARGETS = [
  {
    path: 'docker/security-headers.conf',
    supersededBy: 'docker/runtime/security-headers.conf.template',
  },
]

function readIfGenerated(fullPath) {
  try {
    const content = readFileSync(fullPath, 'utf8')
    return content.startsWith(hashBanner()) ? content : undefined
  } catch {
    return undefined
  }
}

/**
 * Write every target under `root`, or with `check` compare them.
 *
 * Returns what it found rather than exiting, so the unit tests can drive it
 * against a throwaway project: `drifted` lists the targets that differ or are
 * missing (and, with `check`, leaves them alone), `written` the ones it wrote.
 *
 * @param {object} options
 * @param {string} [options.root] The project root.
 * @param {boolean} [options.check] Compare instead of writing.
 * @param {string} [options.apiUrl] `VUESTRATA_API_URL` for the hosted targets.
 * @param {object} [options.deployConfig] `deploy.config.ts`, as loaded.
 * @param {string[]} [options.builtinRuntimeKeys] `RUNTIME_OVERRIDABLE_KEYS`.
 * @param {Record<string, object>} [options.runtimeKeyFormats] `RUNTIME_KEY_FORMATS`.
 * @param {Record<string, string | undefined>} [options.env] The environment
 *   `connectSrcFromEnv` is read from; omit it for the committed targets.
 * @param {boolean} [options.runtimeConfig] Render for an artifact whose API URL
 *   is set at start. Ignored by `check`: the committed targets are the form
 *   without it, and a check that honoured it would pass on a page whose policy
 *   had been left wide open.
 */
export function syncTargets({
  root = repoRoot,
  check = false,
  apiUrl = DEFAULT_API_URL,
  deployConfig = {},
  builtinRuntimeKeys = [],
  runtimeKeyFormats = {},
  env,
  runtimeConfig = false,
  log = logger,
} = {}) {
  const atStart = runtimeConfig && !check
  const options = {
    apiUrl,
    env,
    headers: deployConfig.headers,
    runtimeKeys: resolveRuntimeKeys(builtinRuntimeKeys, deployConfig.runtime ?? []),
    runtimeKeyFormats,
    runtimeConfig: atStart,
    // The image's own default API URL is the one its bundle was built with.
    // Anywhere else the file is not read, and stays as committed.
    buildApiUrl: atStart ? apiUrl : DEFAULT_API_URL,
  }

  const drifted = []
  const written = []

  for (const target of targetsFor(options)) {
    const fullPath = resolve(root, target.path)

    let current = ''
    try {
      current = readFileSync(fullPath, 'utf8')
    } catch {
      if (check) {
        log.error(`${target.path} is missing.`)
        drifted.push(target.path)
        continue
      }
    }

    let desired
    try {
      desired = target.render(current)
    } catch (error) {
      throw new Error(`${target.path}: ${error.message}`, { cause: error })
    }

    if (current === desired) {
      if (!check) log.success(`${target.path} is up to date`)
      continue
    }

    if (check) {
      log.error(`${target.path} has drifted from scripts/security/headers.mjs`)
      drifted.push(target.path)
      continue
    }

    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, desired)
    written.push(target.path)
    log.success(`${target.path} updated`)
  }

  for (const obsolete of OBSOLETE_TARGETS) {
    const fullPath = resolve(root, obsolete.path)
    if (readIfGenerated(fullPath) === undefined) continue

    if (check) {
      log.error(
        `${obsolete.path} is no longer generated (see ${obsolete.supersededBy}) and nothing reads it.`,
      )
      drifted.push(obsolete.path)
      continue
    }
    rmSync(fullPath)
    log.success(`${obsolete.path} removed: superseded by ${obsolete.supersededBy}`)
  }

  return { drifted, written }
}

// ─── Run ─────────────────────────────────────────────────────────────────────

/** `--api-url=<value>`, or undefined when the flag is absent or empty. */
function parseApiUrl(args) {
  return (
    args
      .find((arg) => arg.startsWith('--api-url='))
      ?.slice('--api-url='.length)
      .trim() || undefined
  )
}

async function run(args) {
  const check = args.includes('--check')
  const fromEnv = args.includes('--from-env')
  const runtimeConfig = args.includes('--runtime-config')

  // Empty means the default, as it does for the app.
  const apiUrl =
    parseApiUrl(args) ?? ((fromEnv && process.env[API_URL_KEY]?.trim()) || DEFAULT_API_URL)

  let result
  try {
    const runtime = await loadRuntimeKeys({ root: repoRoot })
    result = syncTargets({
      check,
      apiUrl,
      deployConfig: await loadDeployConfig({ root: repoRoot }),
      builtinRuntimeKeys: runtime.keys,
      runtimeKeyFormats: runtime.formats,
      env: fromEnv ? process.env : undefined,
      runtimeConfig,
    })
  } catch (error) {
    logger.error(error.message)
    process.exit(1)
  }

  if (check && result.drifted.length > 0) {
    logger.error(
      `${result.drifted.length} security-header target(s) out of sync.\n` +
        `The headers are defined in scripts/security/headers.mjs and widened in\n` +
        `src/modules/app/config/deploy.config.ts. Regenerate with:\n` +
        `  vpr security:headers`,
    )
    process.exit(1)
  }

  if (check) {
    logger.success('All security-header targets match scripts/security/headers.mjs')
    if (runtimeConfig) {
      logger.warn('--runtime-config has no effect on --check: the committed form is without it.')
    }
  } else if ((fromEnv || runtimeConfig) && result.written.length > 0) {
    logger.info(
      'Rendered for this environment. Do not commit the result: it is specific to this ' +
        'deployment, and `sync-headers.mjs --check` would report it as drift.',
    )
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

if (isEntryPoint()) await run(process.argv.slice(2))
