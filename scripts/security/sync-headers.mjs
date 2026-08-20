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
 * `--api-url` widens `connect-src` for a cross-origin backend. The COMMITTED
 * files are generated for the default same-origin `/api`; a deployment with a
 * separate API origin re-runs this during its build (the Dockerfile does).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { consola } from 'consola'

import { buildCsp, buildSecurityHeaders, CACHE_RULES, GENERATED_BANNER } from './headers.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const logger = consola.withTag('security-headers')

const args = process.argv.slice(2)
const checkOnly = args.includes('--check')
const apiUrl =
  args
    .find((arg) => arg.startsWith('--api-url='))
    ?.split('=')
    .slice(1)
    .join('=') ?? '/api'

const securityHeaders = buildSecurityHeaders({ apiUrl })

const NL = '\n'

/** The generated-file banner, prefixed for `#`-comment formats. */
function hashBanner() {
  return GENERATED_BANNER.split(NL)
    .map((line) => `# ${line}`)
    .join(NL)
}

// ─── Renderers ───────────────────────────────────────────────────────────────

function renderHeadersFile() {
  const lines = [hashBanner(), '', '/*']
  lines.push(...securityHeaders.map(([name, value]) => `  ${name}: ${value}`))

  for (const rule of CACHE_RULES) {
    lines.push('')
    if (rule.comment) {
      lines.push(...rule.comment.split(NL).map((line) => `# ${line}`))
    }
    lines.push(rule.match)
    lines.push(...rule.headers.map(([name, value]) => `  ${name}: ${value}`))
  }

  return `${lines.join(NL)}${NL}`
}

function renderVercelHeaders() {
  return [
    {
      source: '/(.*)',
      headers: securityHeaders.map(([key, value]) => ({ key, value })),
    },
    ...CACHE_RULES.map((rule) => ({
      source: rule.match === '/assets/*' ? '/assets/(.*)' : rule.match.replace('.', '\\.'),
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
function renderNginxHeadersSnippet() {
  const lines = [
    hashBanner(),
    '#',
    '# Included in EVERY location block on purpose: nginx drops inherited',
    '# add_header directives as soon as a block declares one of its own.',
    ...securityHeaders.map(([name, value]) => `add_header ${name} "${value}" always;`),
  ]
  return `${lines.join(NL)}${NL}`
}

const SNIPPET_INCLUDE = '  include /etc/nginx/snippets/security-headers.conf;'

function renderNginxConf() {
  const locations = CACHE_RULES.filter((rule) => rule.nginxLocation).map((rule) => {
    const isRoot = rule.nginxLocation === '/'
    const body = [
      isRoot ? '    try_files $uri $uri/ /index.html;' : '    expires 1y;',
      `  ${SNIPPET_INCLUDE}`,
      ...rule.headers.map(([name, value]) => `    add_header ${name} "${value}" always;`),
    ]
    return [`  location ${rule.nginxLocation} {`, ...body, '  }'].join(NL)
  })

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
    SNIPPET_INCLUDE,
    '',
    ...locations,
    '',
    '  # Long-lived caching for any other content-hashed asset.',
    '  location ~* \\.(?:js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {',
    '    expires 1y;',
    `  ${SNIPPET_INCLUDE}`,
    '    add_header Cache-Control "public, max-age=31536000, immutable" always;',
    '  }',
    '}',
  ]
  return `${lines.join(NL)}${NL}`
}

// ─── Targets ─────────────────────────────────────────────────────────────────

/**
 * Each target reads its current content and returns the desired content.
 * Identical strings mean "in sync".
 */
const targets = [
  { path: 'public/_headers', render: () => renderHeadersFile() },
  { path: 'docker/nginx.conf', render: () => renderNginxConf() },
  { path: 'docker/security-headers.conf', render: () => renderNginxHeadersSnippet() },
  {
    path: 'vercel.json',
    render: (current) => {
      const config = JSON.parse(current)
      config.headers = renderVercelHeaders()
      return `${JSON.stringify(config, null, 2)}${NL}`
    },
  },
  {
    path: 'index.html',
    render: (current) => {
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
    },
  },
]

// ─── Run ─────────────────────────────────────────────────────────────────────

let drifted = 0

for (const target of targets) {
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
