import { spawnSync } from 'node:child_process'
import path from 'node:path'

import { describe, expect, it } from 'vite-plus/test'

// @ts-expect-error - the header scripts are plain ESM JavaScript with no type declarations.
import * as sync from '../../../scripts/security/sync-headers.mjs'

/**
 * The renderers behind every generated header target.
 *
 * `sync-headers --check` proves the committed files match the renderers. It
 * cannot prove the renderers are right, and the Docker image depends on what
 * they emit: compression, the health probe, the answer to an unrouted API
 * path, a cache policy per path class, and the security headers re-included in
 * every location, because nginx drops inherited `add_header`s the moment a
 * block declares its own.
 */

const SCRIPT = path.join(process.cwd(), 'scripts/security/sync-headers.mjs')
const SNIPPET_INCLUDE = 'include /etc/nginx/snippets/security-headers.conf;'

/** Location → trimmed body lines. No block nests another, so a flat scan is enough. */
function nginxLocations(conf: string): Map<string, string[]> {
  const blocks = new Map<string, string[]>()
  let body: string[] | null = null
  for (const line of conf.split('\n')) {
    const location = /^\s*location\s+(.+?)\s*\{$/.exec(line)?.[1]
    if (location) {
      body = []
      blocks.set(location, body)
    } else if (/^\s*\}$/.test(line)) {
      body = null
    } else {
      body?.push(line.trim())
    }
  }
  return blocks
}

/** The value a block's `add_header <name> "…"` sets, if it sets one. */
function addedHeader(body: string[], name: string) {
  const line = body.find((entry) => entry.startsWith(`add_header ${name} `))
  return line ? /"([^"]*)"/.exec(line)?.[1] : undefined
}

/** A `_headers` file as path → its `Name: value` lines. */
function headersFileRules(file: string): Map<string, string[]> {
  const rules = new Map<string, string[]>()
  let lines: string[] | null = null
  for (const line of file.split('\n')) {
    if (line.startsWith('#')) continue
    if (line.trim() === '') {
      lines = null
    } else if (!line.startsWith(' ')) {
      lines = []
      rules.set(line, lines)
    } else {
      lines?.push(line.trim())
    }
  }
  return rules
}

interface VercelRule {
  source: string
  headers: { key: string; value: string }[]
}

describe('renderNginxConf', () => {
  const conf: string = sync.renderNginxConf()
  const blocks = nginxLocations(conf)

  it('compresses text on the fly and serves the precompressed .gz files', () => {
    expect(conf).toMatch(/^ {2}gzip on;$/m)
    expect(conf).toMatch(/^ {2}gzip_static on;$/m)
    expect(conf).toMatch(/^ {2}gzip_vary on;$/m)

    const types = /^ {2}gzip_types (.+);$/m.exec(conf)?.[1]?.split(' ')
    expect(types).toEqual(
      expect.arrayContaining([
        'text/plain',
        'text/css',
        'text/javascript',
        'application/javascript',
        'application/json',
        'application/wasm',
        'image/svg+xml',
      ]),
    )
  })

  it('answers /healthz itself, uncached and out of the access log', () => {
    const body = blocks.get('= /healthz') ?? []

    expect(body).toContain('return 200 "ok";')
    expect(body).toContain('default_type text/plain;')
    expect(body).toContain('access_log off;')
    expect(addedHeader(body, 'Cache-Control')).toBe('no-store')
  })

  describe('an unrouted same-origin API path', () => {
    it.each([
      ['/api', '^~ /api/'],
      ['/api/', '^~ /api/'],
      ['/backend/v1', '^~ /backend/v1/'],
    ])('VUESTRATA_API_URL=%s answers a JSON 502 at %s', (apiUrl, location) => {
      const body = nginxLocations(sync.renderNginxConf({ apiUrl })).get(location) ?? []

      expect(body).toContain('default_type application/json;')
      expect(addedHeader(body, 'Cache-Control')).toBe('no-store')

      const payload = body
        .map((line) => /^return 502 '(.+)';$/.exec(line)?.[1])
        .find((match) => match !== undefined)
      expect(payload, 'no `return 502` with a quoted body').toBeDefined()
      expect(JSON.parse(payload ?? '')).toMatchObject({ error: 'api_not_routed' })
    })

    it.each(['https://api.example.com', 'https://api.example.com/api', '/'])(
      'VUESTRATA_API_URL=%s gets no API block',
      (apiUrl) => {
        const rendered: string = sync.renderNginxConf({ apiUrl })

        expect(rendered).not.toContain('return 502')
        expect([...nginxLocations(rendered).keys()]).not.toContain('^~ /api/')
      },
    )

    it.each(['/api v2', '/api;', '/api/$host', '//evil.example/api'])(
      'refuses to write %j into the nginx config',
      (apiUrl) => {
        expect(() => sync.renderNginxConf({ apiUrl })).toThrow(/Cannot route VUESTRATA_API_URL/)
      },
    )
  })

  it('sets one cache policy per path class, and caches only /assets/ forever', () => {
    const policy = Object.fromEntries(
      [...blocks].map(([location, body]) => [location, addedHeader(body, 'Cache-Control')]),
    )

    expect(policy).toEqual({
      '= /healthz': 'no-store',
      '^~ /api/': 'no-store',
      '= /index.html': 'no-cache',
      '^~ /assets/': 'public, max-age=31536000, immutable',
      '= /version.json': 'no-store',
      '= /runtime-config.js': 'no-store',
      '= /mockServiceWorker.js': 'no-cache, no-store, must-revalidate',
      '/': 'public, max-age=3600',
    })
  })

  it('puts a cache lifetime on successful responses only', () => {
    // `always` would add it to errors as well: a 404 for a chunk requested
    // mid-deploy from a server that lacks it would be kept for a year. The
    // unrouted-API 502 is the exception, because the error is the response.
    for (const [location, body] of blocks) {
      const cacheControl = body.find((line) => line.startsWith('add_header Cache-Control '))
      if (location === '^~ /api/') {
        expect(cacheControl).toMatch(/ always;$/)
      } else {
        expect(cacheControl, `location ${location}`).not.toMatch(/ always;$/)
      }
    }
  })

  it('sends the security headers on every response, errors included', () => {
    const snippet: string = sync.renderNginxHeadersSnippet()
    const lines = snippet.split('\n').filter((line) => line.startsWith('add_header '))

    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) expect(line).toMatch(/ always;$/)
  })

  it('hands SPA routes to /index.html rather than caching them for an hour', () => {
    // `location /` caches the files it finds for an hour. A route is not one of
    // them: try_files redirects it internally to /index.html, and that block's
    // no-cache applies instead.
    expect(blocks.get('/')).toContain('try_files $uri $uri/ /index.html;')
    expect(addedHeader(blocks.get('= /index.html') ?? [], 'Cache-Control')).toBe('no-cache')
  })

  it.each(['/api', 'https://api.example.com'])(
    're-includes the security headers in every location (VUESTRATA_API_URL=%s)',
    (apiUrl) => {
      const rendered: string = sync.renderNginxConf({ apiUrl })
      const locations = nginxLocations(rendered)

      expect(locations.size).toBeGreaterThan(0)
      for (const [location, body] of locations) {
        expect(body, `location ${location}`).toContain(SNIPPET_INCLUDE)
      }
      // And once at server level, for responses no location produces.
      expect(rendered).toContain(`\n  ${SNIPPET_INCLUDE}\n`)
    },
  )
})

describe('the hosted targets', () => {
  const headersFile = headersFileRules(sync.renderHeadersFile())
  const vercel = new Map(
    (sync.renderVercelHeaders() as VercelRule[]).map((rule) => [rule.source, rule.headers]),
  )

  const headersFileCacheControl = (path: string) =>
    headersFile
      .get(path)
      ?.find((line) => line.startsWith('Cache-Control: '))
      ?.slice('Cache-Control: '.length)
  const vercelCacheControl = (source: string) =>
    vercel.get(source)?.find((header) => header.key === 'Cache-Control')?.value

  it.each([
    ['/index.html', '/index\\.html', 'no-cache'],
    ['/assets/*', '/assets/(.*)', 'public, max-age=31536000, immutable'],
    ['/version.json', '/version\\.json', 'no-store'],
    ['/runtime-config.js', '/runtime-config\\.js', 'no-store'],
  ])('express the nginx policy for %s', (path, source, cacheControl) => {
    expect(headersFileCacheControl(path)).toBe(cacheControl)
    expect(vercelCacheControl(source)).toBe(cacheControl)
  })

  it('cache nothing but /assets/ as immutable', () => {
    expect(
      [...headersFile.keys()].filter((path) =>
        headersFileCacheControl(path)?.includes('immutable'),
      ),
    ).toEqual(['/assets/*'])
    expect(
      [...vercel.keys()].filter((source) => vercelCacheControl(source)?.includes('immutable')),
    ).toEqual(['/assets/(.*)'])
  })

  it('set no Cache-Control on the catch-all rule', () => {
    // A `_headers` host joins the values of a header that two matching rules
    // both set, so a catch-all Cache-Control would be appended to the /assets/
    // one rather than overridden by it. It would also reach every SPA route.
    expect(headersFileCacheControl('/*')).toBeUndefined()
    expect(vercelCacheControl('/(.*)')).toBeUndefined()
  })
})

describe('the CLI', () => {
  it('still runs when node is pointed at the file', () => {
    // A CSP widened for another origin cannot match the committed targets, so
    // a working --check must report drift. A broken entry-point guard would
    // exit 0 without checking anything, and `vpr lint` would pass on drift.
    const result = spawnSync(
      process.execPath,
      [SCRIPT, '--check', '--api-url=https://api.example.com'],
      { encoding: 'utf8' },
    )

    expect(result.status).toBe(1)
    expect(`${result.stdout}${result.stderr}`).toMatch(/has drifted/)
  })
})
