import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

// @ts-expect-error - the header scripts are plain ESM JavaScript with no type declarations.
import * as headers from '../../../scripts/security/headers.mjs'
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
const SNIPPET_INCLUDE = 'include /tmp/vuestrata/security-headers.conf;'
const API_LOCATION_INCLUDE = 'include /tmp/vuestrata/api-location.conf;'
/** The regex location for files that name a script, style, image or font. */
const STATIC_FILES = '~* \\.(?:js|mjs|css|png|jpe?g|gif|ico|svg|webp|avif|woff2?|ttf|otf)$'

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

const LOADER = path.join(process.cwd(), 'scripts/security/deploy-config.mjs')

/**
 * Run `body` under plain Node with the deploy-config loader in scope, and
 * return what it returns.
 *
 * Not in this process: these suites run in jsdom, whose `TextEncoder` belongs
 * to a different realm than Node's `Uint8Array`, and the esbuild inside tsx
 * refuses to start there. A child process is also the honest test. The
 * generator and the Vite plugin both call the loader from Node, and "does tsx
 * resolve the `~` alias from a plain `node` on this platform" is the question.
 */
function underNode<T = unknown>(body: string): T {
  const source = `
    import * as loader from ${JSON.stringify(pathToFileURL(LOADER).href)}
    const result = await (async () => { ${body} })()
    process.stdout.write(JSON.stringify(result ?? null))
  `
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    encoding: 'utf8',
    cwd: process.cwd(),
  })
  if (result.status !== 0) throw new Error(`node exited ${result.status}: ${result.stderr}`)
  return JSON.parse(result.stdout) as T
}

/** `RUNTIME_OVERRIDABLE_KEYS`, read from the source the way the generator reads it. */
const loaderKeys = underNode<string[]>('return loader.loadRuntimeOverridableKeys()')

/** The blocks that answer an unrouted API at `apiUrl`, as the entrypoint renders them. */
const apiLocations = (apiUrl: string) =>
  nginxLocations(sync.renderApiLocation(headers.sameOriginApiPath(apiUrl)) as string)

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

  it('is one server block for every environment', () => {
    // The image is built once. Nothing an environment decides may be in the
    // file: it includes what the entrypoint renders at container start.
    expect(sync.renderNginxConf({ apiUrl: 'https://api.example.com' })).toBe(conf)
    expect(conf).not.toMatch(/return 502/)
    expect(conf).not.toContain(headers.CONNECT_SRC_PLACEHOLDER)
    expect(conf).not.toContain(headers.API_PATH_PLACEHOLDER)
  })

  it('takes the unrouted-API answer from the file the entrypoint writes', () => {
    const lines = conf.split('\n').map((line) => line.trim())

    expect(lines.filter((line) => line === API_LOCATION_INCLUDE)).toHaveLength(1)
    // At server level, where a location may be declared — not inside one.
    expect([...blocks.values()].flat()).not.toContain(API_LOCATION_INCLUDE)
  })

  it('serves /runtime-config.js from what the entrypoint wrote, never cached', () => {
    const body = blocks.get('= /runtime-config.js') ?? []

    // Not the empty copy the build left in the web root.
    expect(body).toContain('alias /tmp/vuestrata/runtime-config.js;')
    expect(addedHeader(body, 'Cache-Control')).toBe('no-store')
    expect(body).toContain(SNIPPET_INCLUDE)
  })

  it('sets one cache policy per path class, and caches only /assets/ forever', () => {
    const policy = Object.fromEntries(
      [...blocks].map(([location, body]) => [location, addedHeader(body, 'Cache-Control')]),
    )

    expect(policy).toEqual({
      '= /healthz': 'no-store',
      '= /index.html': 'no-cache',
      '^~ /assets/': 'public, max-age=31536000, immutable',
      '= /version.json': 'no-store',
      '= /runtime-config.js': 'no-store',
      '= /mockServiceWorker.js': 'no-cache, no-store, must-revalidate',
      '/': 'public, max-age=3600',
      [STATIC_FILES]: 'public, max-age=3600',
    })
  })

  it('404s a missing script, image or font instead of falling back to the app', () => {
    // The old regex location had no fallback, so a stale <img> or a removed
    // script was a 404. Through `location /` it would get index.html with a
    // 200, and nothing would look broken.
    const body = blocks.get(STATIC_FILES) ?? []

    expect(body).toContain('try_files $uri =404;')
    expect(body).not.toContain('try_files $uri $uri/ /index.html;')
    for (const extension of ['js', 'css', 'png', 'svg', 'ico', 'woff2']) {
      expect(STATIC_FILES).toContain(extension)
    }
    // Only the catch-all falls back to the app.
    for (const [location, other] of blocks) {
      if (location === '/') continue
      expect(other, `location ${location}`).not.toContain('try_files $uri $uri/ /index.html;')
    }
  })

  it('puts a cache lifetime on successful responses only', () => {
    // `always` would add it to errors as well: a 404 for a chunk requested
    // mid-deploy from a server that lacks it would be kept for a year.
    for (const [location, body] of blocks) {
      const cacheControl = body.find((line) => line.startsWith('add_header Cache-Control '))
      expect(cacheControl, `location ${location}`).not.toMatch(/ always;$/)
    }
  })

  it('hands SPA routes to /index.html rather than caching them for an hour', () => {
    // `location /` caches the files it finds for an hour. A route is not one of
    // them: try_files redirects it internally to /index.html, and that block's
    // no-cache applies instead.
    expect(blocks.get('/')).toContain('try_files $uri $uri/ /index.html;')
    expect(addedHeader(blocks.get('= /index.html') ?? [], 'Cache-Control')).toBe('no-cache')
  })

  it('re-includes the security headers in every location', () => {
    expect(blocks.size).toBeGreaterThan(0)
    for (const [location, body] of blocks) {
      expect(body, `location ${location}`).toContain(SNIPPET_INCLUDE)
    }
    // And once at server level, for responses no location produces.
    expect(conf).toContain(`\n  ${SNIPPET_INCLUDE}\n`)
  })
})

describe('an unrouted same-origin API path', () => {
  it.each([
    ['/api', '^~ /api/'],
    ['/api', '= /api'],
    ['/api/', '^~ /api/'],
    ['/api/', '= /api'],
    ['/backend/v1', '^~ /backend/v1/'],
    ['/backend/v1', '= /backend/v1'],
  ])('VUESTRATA_API_URL=%s answers a JSON 502 at %s', (apiUrl, location) => {
    const body = apiLocations(apiUrl).get(location) ?? []

    expect(body).toContain('default_type application/json;')
    expect(addedHeader(body, 'Cache-Control')).toBe('no-store')

    const payload = body
      .map((line) => /^return 502 '(.+)';$/.exec(line)?.[1])
      .find((match) => match !== undefined)
    expect(payload, 'no `return 502` with a quoted body').toBeDefined()
    expect(JSON.parse(payload ?? '')).toMatchObject({ error: 'api_not_routed' })
    // nginx reads the body inside a single-quoted string.
    expect(payload).not.toMatch(/['$\\]/)
  })

  it('labels the body JSON whatever extension the request path ends in', () => {
    // default_type only applies to a path whose extension mime.types does not
    // know, so /api/export.html would go out as text/html without this.
    const blocks = apiLocations('/api')
    for (const location of ['^~ /api/', '= /api']) {
      const body = blocks.get(location) ?? []
      const types = body.indexOf('types { }')
      expect(types, `location ${location}`).toBeGreaterThanOrEqual(0)
      expect(types).toBeLessThan(body.indexOf('default_type application/json;'))
    }
  })

  it('sends its headers on the error, which is the whole response', () => {
    // 502 is not a status nginx adds headers to by default.
    for (const [location, body] of apiLocations('/api')) {
      expect(body, `location ${location}`).toContain(SNIPPET_INCLUDE)
      expect(body.find((line) => line.startsWith('add_header Cache-Control '))).toMatch(/ always;$/)
    }
  })

  it.each(['https://api.example.com', 'https://api.example.com/api', '/'])(
    'VUESTRATA_API_URL=%s has no path to answer for',
    (apiUrl) => {
      expect(headers.sameOriginApiPath(apiUrl)).toBeNull()
    },
  )

  it.each(['/api v2', '/api;', '/api/$host', '//evil.example/api', "/api'", '/api\n', '/api}'])(
    'refuses to write %j into the nginx config',
    (apiUrl) => {
      expect(() => headers.sameOriginApiPath(apiUrl)).toThrow(/Cannot route VUESTRATA_API_URL/)
    },
  )

  it('ships as a template whose path the entrypoint fills', () => {
    const template: string = sync.renderApiLocationTemplate()
    const placeholder: string = headers.API_PATH_PLACEHOLDER

    expect([...nginxLocations(template).keys()]).toEqual([`^~ ${placeholder}/`, `= ${placeholder}`])
    // Substituting the path gives exactly the blocks rendered for it.
    expect(template.replaceAll(placeholder, '/api')).toContain(sync.renderApiLocation('/api'))
  })
})

describe('the security-header snippet', () => {
  it('sends the security headers on every response, errors included', () => {
    const snippet: string = sync.renderNginxHeadersSnippet()
    const lines = snippet.split('\n').filter((line) => line.startsWith('add_header '))

    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) expect(line).toMatch(/ always;$/)
  })

  it('ships as a template: everything fixed except the origins of the environment', () => {
    const template: string = sync.renderNginxHeadersTemplate()
    const placeholder: string = headers.CONNECT_SRC_PLACEHOLDER

    expect(template.split(placeholder)).toHaveLength(2)
    expect(template).toContain(`connect-src 'self' ${placeholder};`)
    // What the entrypoint does for a container with nothing to add: drop the
    // lines that describe the template, and the placeholder with its space.
    expect(
      template
        .split('\n')
        .filter((line) => !line.startsWith('#@template'))
        .join('\n')
        .replaceAll(` ${placeholder}`, ''),
    ).toBe(sync.renderNginxHeadersSnippet())
  })

  it('says it is a template only on lines the entrypoint drops', () => {
    for (const template of [
      sync.renderNginxHeadersTemplate() as string,
      sync.renderApiLocationTemplate() as string,
    ]) {
      const notes = template.split('\n').filter((line) => line.startsWith('#@template'))

      expect(notes.length).toBeGreaterThan(0)
      // A placeholder named in a comment would be substituted along with the
      // real one, and the rendered file would carry a comment that reads wrong.
      for (const note of notes) expect(note).not.toMatch(/__VUESTRATA_/)
    }
  })

  it('renders the same template in every environment', () => {
    const deploy = { connectSrc: ['https://login.acme.test'], connectSrcFromEnv: ['VUESTRATA_A'] }

    expect(
      sync.renderNginxHeadersTemplate({
        headers: deploy,
        apiUrl: 'https://api.acme.test',
        env: { VUESTRATA_A: 'https://a.test' },
      }),
    ).toBe(sync.renderNginxHeadersTemplate({ headers: deploy }))
    expect(sync.renderNginxHeadersTemplate({ headers: deploy })).toContain(
      `connect-src 'self' https://login.acme.test ${headers.CONNECT_SRC_PLACEHOLDER};`,
    )
  })

  it('carries the configured COOP and frame policy into the image', () => {
    const template: string = sync.renderNginxHeadersTemplate({
      headers: { crossOriginOpenerPolicy: 'same-origin-allow-popups', frameAncestors: ["'self'"] },
    })

    expect(template).toContain('add_header Cross-Origin-Opener-Policy "same-origin-allow-popups"')
    expect(template).toContain('add_header X-Frame-Options "SAMEORIGIN"')
    expect(template).toContain("frame-ancestors 'self';")
  })
})

describe('docker/runtime/keys', () => {
  const entries = (options?: object) =>
    (sync.renderRuntimeKeys(options) as string)
      .split('\n')
      .filter((line) => line !== '' && !line.startsWith('#'))

  it('lists what the entrypoint may write to runtime-config.js, and the API URL', () => {
    expect(entries({ runtimeKeys: ['VUESTRATA_API_URL', 'VUESTRATA_RELEASE'] })).toEqual([
      'config VUESTRATA_API_URL',
      'config VUESTRATA_RELEASE',
      'api VUESTRATA_API_URL /api',
    ])
  })

  it('adds the variables whose origin widens connect-src', () => {
    expect(
      entries({
        runtimeKeys: ['VUESTRATA_API_URL'],
        headers: {
          connectSrcFromEnv: ['VUESTRATA_ERROR_REPORTING_DSN', 'VUESTRATA_SUPABASE_URL'],
          websocketFromEnv: ['VUESTRATA_SUPABASE_URL'],
        },
      }),
    ).toEqual([
      'config VUESTRATA_API_URL',
      'api VUESTRATA_API_URL /api',
      'connect VUESTRATA_ERROR_REPORTING_DSN',
      'connect VUESTRATA_SUPABASE_URL',
      'websocket VUESTRATA_SUPABASE_URL',
    ])
  })

  it('refuses a name the entrypoint could not read safely', () => {
    expect(() => sync.renderRuntimeKeys({ runtimeKeys: ['VUESTRATA_A; rm -rf /'] })).toThrow(
      /runtime key/,
    )
    expect(() => sync.renderRuntimeKeys({ headers: { connectSrcFromEnv: ['$(id)'] } })).toThrow(
      /not an environment variable name/,
    )
  })
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

  it('carry the origins a static host is deployed with', () => {
    const options = {
      apiUrl: 'https://api.acme.test/v1',
      headers: { connectSrcFromEnv: ['VUESTRATA_ERROR_REPORTING_DSN'] },
      env: { VUESTRATA_ERROR_REPORTING_DSN: 'https://key@o1.ingest.sentry.test/42' },
    }
    const expected = "connect-src 'self' https://api.acme.test https://o1.ingest.sentry.test;"

    expect(sync.renderHeadersFile(options)).toContain(expected)
    expect(
      (sync.renderVercelHeaders(options) as VercelRule[])[0]?.headers.find(
        (header) => header.key === 'Content-Security-Policy',
      )?.value,
    ).toContain(expected)
  })
})

describe('index.html', () => {
  const page = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8')
  const metaCsp = (html: string) =>
    /http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(html)?.[1] ?? ''

  it('is committed with the policy the generator writes', () => {
    expect(sync.renderIndexHtml(page)).toBe(page)
  })

  it('does not restrict connections in the page, whatever the API URL', () => {
    expect(metaCsp(page)).toContain('connect-src *;')
    expect(sync.renderIndexHtml(page, { apiUrl: 'https://api.acme.test' })).toBe(page)
  })

  it('carries the configured image and frame sources', () => {
    const html: string = sync.renderIndexHtml(page, {
      headers: { imgSrc: ['https://images.acme.test'], frameSrc: ['https://js.stripe.test'] },
    })

    expect(metaCsp(html)).toContain("img-src 'self' data: blob: https://images.acme.test;")
    expect(metaCsp(html)).toContain("frame-src 'self' https://js.stripe.test")
    // Only the attribute changed.
    expect(html.replace(metaCsp(html), metaCsp(page))).toBe(page)
  })

  it('fails loudly on a page with no CSP meta tag', () => {
    expect(() => sync.renderIndexHtml('<html><head></head></html>')).toThrow(
      /Could not find the Content-Security-Policy/,
    )
  })
})

describe('syncTargets', () => {
  const roots: string[] = []
  const log = { success: vi.fn(), error: vi.fn(), info: vi.fn() }
  const BUILTIN = ['VUESTRATA_API_URL', 'VUESTRATA_RELEASE']

  /** A project with the two targets that are edited in place rather than written whole. */
  function project(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vuestrata-headers-'))
    roots.push(root)
    for (const file of ['vercel.json', 'index.html']) {
      fs.copyFileSync(path.join(process.cwd(), file), path.join(root, file))
    }
    return root
  }

  const run = (root: string, options: object = {}) =>
    sync.syncTargets({ root, log, builtinRuntimeKeys: BUILTIN, ...options }) as {
      drifted: string[]
      written: string[]
    }
  const read = (root: string, file: string) => fs.readFileSync(path.join(root, file), 'utf8')

  const widened = {
    runtime: [],
    headers: {
      connectSrc: ['https://login.acme.test', 'wss://realtime.acme.test'],
      connectSrcFromEnv: ['VUESTRATA_ERROR_REPORTING_DSN'],
      imgSrc: ['https://images.acme.test'],
      crossOriginOpenerPolicy: 'same-origin-allow-popups',
    },
  }

  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('writes every target, and then finds nothing to change', () => {
    const root = project()

    expect(run(root).written.sort()).toEqual(
      [
        'docker/nginx.conf',
        'docker/runtime/api-location.conf.template',
        'docker/runtime/keys',
        'docker/runtime/security-headers.conf.template',
        'public/_headers',
      ].sort(),
    )
    expect(run(root)).toEqual({ drifted: [], written: [] })
    expect(run(root, { check: true })).toEqual({ drifted: [], written: [] })
  })

  it('matches what is committed, for the config that is committed', () => {
    // The same proof `vpr lint` makes, without a child process.
    expect(sync.syncTargets({ check: true, log, builtinRuntimeKeys: loaderKeys }).drifted).toEqual(
      [],
    )
  })

  it('passes --check for a policy widened through deploy.config.ts', () => {
    // The defect this fixes: a project that committed a cross-origin CSP had
    // no way to make the drift check expect it, so `vpr lint` failed forever.
    const root = project()
    run(root, { deployConfig: widened })

    expect(run(root, { check: true, deployConfig: widened })).toEqual({ drifted: [], written: [] })
    expect(read(root, 'public/_headers')).toContain(
      "connect-src 'self' https://login.acme.test wss://realtime.acme.test;",
    )
    expect(read(root, 'public/_headers')).toContain(
      'Cross-Origin-Opener-Policy: same-origin-allow-popups',
    )
    expect(read(root, 'vercel.json')).toContain('https://login.acme.test')
    expect(read(root, 'index.html')).toContain('https://images.acme.test')
    expect(read(root, 'docker/runtime/keys')).toContain('connect VUESTRATA_ERROR_REPORTING_DSN')
  })

  it('reports drift when the config changed and the targets were not regenerated', () => {
    const root = project()
    run(root)

    const { drifted, written } = run(root, { check: true, deployConfig: widened })

    expect(written).toEqual([])
    expect(drifted).toEqual(
      expect.arrayContaining([
        'public/_headers',
        'vercel.json',
        'index.html',
        'docker/runtime/keys',
        'docker/runtime/security-headers.conf.template',
      ]),
    )
    // A check never writes.
    expect(read(root, 'public/_headers')).not.toContain('login.acme.test')
  })

  it('reports a missing target instead of creating it during a check', () => {
    const root = project()

    const { drifted } = run(root, { check: true })

    expect(drifted).toContain('public/_headers')
    expect(fs.existsSync(path.join(root, 'public/_headers'))).toBe(false)
  })

  it('renders a static host from its environment, and leaves the image alone', () => {
    const root = project()
    run(root, { deployConfig: widened })
    const template = read(root, 'docker/runtime/security-headers.conf.template')
    const keys = read(root, 'docker/runtime/keys')
    const page = read(root, 'index.html')

    // What `--from-env` does on a static host's deploy.
    const { written } = run(root, {
      deployConfig: widened,
      apiUrl: 'https://api.staging.acme.test/v1',
      env: { VUESTRATA_ERROR_REPORTING_DSN: 'https://key@o1.ingest.sentry.test/42' },
    })

    expect(written.sort()).toEqual(['public/_headers', 'vercel.json'])
    expect(read(root, 'public/_headers')).toContain(
      "connect-src 'self' https://login.acme.test wss://realtime.acme.test " +
        'https://api.staging.acme.test https://o1.ingest.sentry.test;',
    )
    // The image decides at container start, and the page does not restrict
    // connections: neither may change with the environment that ran this.
    expect(read(root, 'docker/runtime/security-headers.conf.template')).toBe(template)
    expect(read(root, 'docker/runtime/keys')).toBe(keys)
    expect(read(root, 'index.html')).toBe(page)
    // Which is exactly why the result is not to be committed.
    expect(run(root, { check: true, deployConfig: widened }).drifted.sort()).toEqual([
      'public/_headers',
      'vercel.json',
    ])
  })

  it.each([
    ['an API URL with a quote', { apiUrl: 'https://a.test";alert(1)//' }],
    ['an API URL with a space', { apiUrl: 'https://a.test evil.test' }],
    ['an API URL that is not http(s)', { apiUrl: 'javascript:alert(1)' }],
    [
      'an environment value that is not a URL',
      {
        deployConfig: { headers: { connectSrcFromEnv: ['VUESTRATA_A'] } },
        env: { VUESTRATA_A: '"; add_header X y' },
      },
    ],
    ['a source with a path', { deployConfig: { headers: { connectSrc: ['https://a.test/x'] } } }],
    ['a runtime key that is not a name', { deployConfig: { runtime: ['VUESTRATA_A B'] } }],
  ])('writes nothing at all for %s', (_, options) => {
    const root = project()
    const before = fs.readdirSync(root).sort()

    expect(() => run(root, options)).toThrow()

    expect(fs.readdirSync(root).sort()).toEqual(before)
    expect(read(root, 'vercel.json')).toBe(read(process.cwd(), 'vercel.json'))
  })

  it('writes the origin of an API URL, never the text it was given', () => {
    // The URL parser drops a newline, so this one is not refused. What matters
    // is that only the origin it found is written anywhere.
    const root = project()

    run(root, { apiUrl: 'https://a.test/v1\nX-Injected: 1' })

    for (const file of ['public/_headers', 'vercel.json']) {
      expect(read(root, file)).toContain("connect-src 'self' https://a.test;")
      expect(read(root, file)).not.toMatch(/X-Injected/)
    }
  })

  describe('the snippet an older release generated', () => {
    const OLD = 'docker/security-headers.conf'
    const generated: string = sync.renderNginxHeadersSnippet()

    it('is removed, because nothing reads it any more', () => {
      const root = project()
      fs.mkdirSync(path.join(root, 'docker'))
      fs.writeFileSync(path.join(root, OLD), generated)

      run(root)

      expect(fs.existsSync(path.join(root, OLD))).toBe(false)
    })

    it('fails the check until it is', () => {
      const root = project()
      run(root)
      fs.writeFileSync(path.join(root, OLD), generated)

      expect(run(root, { check: true }).drifted).toEqual([OLD])
      expect(fs.existsSync(path.join(root, OLD))).toBe(true)
    })

    it('is left alone when the project wrote a file of that name itself', () => {
      const root = project()
      run(root)
      fs.writeFileSync(path.join(root, OLD), 'add_header X-Mine "1" always;\n')

      expect(run(root, { check: true }).drifted).toEqual([])
      run(root)
      expect(fs.existsSync(path.join(root, OLD))).toBe(true)
    })
  })
})

describe('reading the project from Node', () => {
  it('loads the built-in runtime keys from the module the browser uses', async () => {
    const { RUNTIME_OVERRIDABLE_KEYS } = await import('~/lib/config/runtime-overlay')

    expect(loaderKeys).toEqual([...RUNTIME_OVERRIDABLE_KEYS])
  })

  it('loads the seeded deploy.config.ts, which declares nothing', () => {
    expect(underNode('return loader.loadDeployConfig()')).toEqual({})
  })

  it('loads a config that declares variables and headers, through the ~ alias', () => {
    const config = underNode<{
      env: string[]
      runtime: string[]
      headers: Record<string, unknown>
      rejectsInvalid: boolean
    }>(`
      const config = await loader.loadDeployConfig({
        file: 'test/fixtures/deploy-config/widened.config.ts',
      })
      return {
        env: Object.keys(config.env),
        runtime: config.runtime,
        headers: config.headers,
        // The schemas arrive as real zod schemas, not as stripped types.
        rejectsInvalid: !config.env.VUESTRATA_FEATURE_BILLING.safeParse('maybe').success,
      }
    `)

    expect(config.env).toEqual(['VUESTRATA_SUPABASE_URL', 'VUESTRATA_FEATURE_BILLING'])
    expect(config.runtime).toEqual(['VUESTRATA_SUPABASE_URL'])
    expect(config.headers.connectSrcFromEnv).toEqual(['VUESTRATA_SUPABASE_URL'])
    expect(config.headers.crossOriginOpenerPolicy).toBe('same-origin-allow-popups')
    expect(config.rejectsInvalid).toBe(true)
  })

  it('treats a project that has no deploy.config.ts yet as declaring nothing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vuestrata-headers-'))
    try {
      expect(
        underNode(`return loader.loadDeployConfig({ root: ${JSON.stringify(root)} })`),
      ).toEqual({})
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('refuses a file that exports something other than a config', () => {
    const failure = underNode<string>(`
      return loader
        .loadDeployConfig({ file: 'test/fixtures/deploy-config/not-a-config.ts' })
        .then(() => 'loaded', (error) => error.message)
    `)

    expect(failure).toMatch(/must `export default defineDeployConfig/)
  })
})

describe('the CLI', () => {
  const cli = (args: string[], env: Record<string, string> = {}) =>
    spawnSync(process.execPath, [SCRIPT, ...args], {
      encoding: 'utf8',
      env: { ...process.env, ...env },
    })

  it('passes --check on the committed targets', () => {
    const result = cli(['--check'])

    expect(result.status, `${result.stdout}${result.stderr}`).toBe(0)
  })

  it('still runs when node is pointed at the file', () => {
    // A CSP widened for another origin cannot match the committed targets, so
    // a working --check must report drift. A broken entry-point guard would
    // exit 0 without checking anything, and `vpr lint` would pass on drift.
    const result = cli(['--check', '--api-url=https://api.example.com'])

    expect(result.status).toBe(1)
    expect(`${result.stdout}${result.stderr}`).toMatch(/has drifted/)
  })

  it('gives the same answer whatever the environment holds, without --from-env', () => {
    // `vpr lint` must not depend on the machine it runs on.
    const result = cli(['--check'], { VUESTRATA_API_URL: 'https://api.elsewhere.test' })

    expect(result.status).toBe(0)
  })

  it('reads the API URL from the environment with --from-env', () => {
    const result = cli(['--check', '--from-env'], {
      VUESTRATA_API_URL: 'https://api.elsewhere.test',
    })
    const output = `${result.stdout}${result.stderr}`

    expect(result.status).toBe(1)
    expect(output).toMatch(/public\/_headers has drifted/)
    // The image's templates do not vary with the environment.
    expect(output).not.toMatch(/docker\//)
  })

  it('stops on an API URL it cannot turn into a source', () => {
    const result = cli(['--check', '--api-url=javascript:alert(1)'])

    expect(result.status).toBe(1)
    expect(`${result.stdout}${result.stderr}`).toMatch(/scheme must be one of http, https/)
  })
})
