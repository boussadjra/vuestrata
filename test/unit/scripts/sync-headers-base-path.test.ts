import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

// @ts-expect-error - the header scripts are plain ESM JavaScript with no type declarations.
import * as headers from '../../../scripts/security/headers.mjs'
// @ts-expect-error - same.
import * as sync from '../../../scripts/security/sync-headers.mjs'
import { describeBasePathIssue } from '../../../src/modules/core/lib/config/env.schema'

/**
 * The generated deployment files for an app served under a path prefix.
 *
 * The generator takes the base path (`--base-path`, or `VUESTRATA_BASE_PATH`
 * with `--from-env`) and renders the same policy under it: the cache rules of
 * the hosted targets, and for the image the locations, the SPA fallback and an
 * answer for what lies outside the prefix.
 *
 * What it renders with no base path is pinned in base-path-default.test.ts;
 * the rules themselves are in sync-headers.test.ts.
 */

const SCRIPT = path.join(process.cwd(), 'scripts/security/sync-headers.mjs')
const SNIPPET_INCLUDE = 'include /tmp/vuestrata/security-headers.conf;'
const BASE = '/console/'

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

const addedHeader = (body: string[], name: string) => {
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

/**
 * Values that must never reach a generated file. Each would change what the
 * file MEANS to the server that reads it: end an nginx directive, open a
 * block, start a variable, add a header line, or send the redirect elsewhere.
 */
const HOSTILE: [string, string][] = [
  ['a directive of its own', '/console/; return 200 "x";/'],
  ['a block of its own', '/a/ { return 200; } location /b/'],
  ['a closing brace', '/a/}/'],
  ['an nginx variable', '/$host/'],
  ['a variable in braces', '/${uri}/'],
  ['a line break and a header', '/a/\n  X-Injected: 1\n/'],
  ['a carriage return', '/a\r/'],
  ['a quote', '/a"b/'],
  ['a single quote', "/a'b/"],
  ['a backslash', '/a\\b/'],
  ['a space', '/a b/'],
  ['a TAB', '/a\tb/'],
  ['a comment', '/a#b/'],
  ['a regex location', '/~* \\.php$/'],
  ['a wildcard', '/a*/'],
  ['parentheses, which a Vercel source reads as a group', '/a(.*)/'],
  ['a colon, which a Vercel source reads as a parameter', '/:path/'],
  ['a protocol-relative URL', '//evil.example/'],
  ['a full URL', 'https://evil.example/'],
  ['a parent segment', '/a/../b/'],
  ['a current-directory segment', '/./'],
  ['an encoded slash', '/a%2Fb/'],
  ['an empty segment', '/a//b/'],
  ['no leading slash', 'console/'],
  ['no trailing slash', '/console'],
  ['a query', '/console/?x=1'],
  ['a path Git Bash rewrote', 'C:/Program Files/Git/console/'],
]

describe('resolveBasePath', () => {
  it('reads unset and empty as the root', () => {
    expect(headers.resolveBasePath()).toBe('/')
    expect(headers.resolveBasePath(undefined)).toBe('/')
    expect(headers.resolveBasePath(null)).toBe('/')
    expect(headers.resolveBasePath('')).toBe('/')
    expect(headers.DEFAULT_BASE_PATH).toBe('/')
  })

  it.each([['/'], ['/console/'], ['/apps/console/'], ['/a.b_c~d-e/'], ['/V2/Console/']])(
    'accepts %j as it is',
    (value) => {
      expect(headers.resolveBasePath(value)).toBe(value)
    },
  )

  it.each(HOSTILE)('refuses %s', (_name, value) => {
    expect(() => headers.resolveBasePath(value)).toThrow(
      /VUESTRATA_BASE_PATH=.* is not a base path/,
    )
  })

  it('refuses something that is not a string', () => {
    expect(() => headers.resolveBasePath(42)).toThrow(/expected a string/)
    expect(() => headers.resolveBasePath(['/console/'])).toThrow(/expected a string/)
  })

  it('says what Git Bash did to the value', () => {
    expect(() => headers.resolveBasePath('C:/Program Files/Git/console/')).toThrow(
      /MSYS_NO_PATHCONV/,
    )
  })

  // Two implementations of one rule, on purpose: the generator must not
  // depend on the app's schema having run. They have to agree, or a build
  // would accept a base the generator refuses.
  it('agrees with the schema the build validates the variable with', () => {
    const values = [
      '/',
      '/console/',
      '/apps/console/',
      '/a.b_c~d-e/',
      '/V2/Console/',
      ...HOSTILE.map(([, value]) => value),
    ]
    for (const value of values) {
      let accepted = true
      try {
        headers.resolveBasePath(value)
      } catch {
        accepted = false
      }
      expect(describeBasePathIssue(value) === null, JSON.stringify(value)).toBe(accepted)
    }
  })
})

describe('a hostile base path', () => {
  const renderers: [string, (basePath: string) => unknown][] = [
    ['renderNginxConf', (basePath) => sync.renderNginxConf({ basePath })],
    ['renderHeadersFile', (basePath) => sync.renderHeadersFile({ basePath })],
    ['renderVercelHeaders', (basePath) => sync.renderVercelHeaders({ basePath })],
    ['renderRuntimeKeys', (basePath) => sync.renderRuntimeKeys({ basePath })],
    ['cacheRulesFor', (basePath) => headers.cacheRulesFor(basePath)],
    ['reservedApiPaths', (basePath) => headers.reservedApiPaths(basePath)],
  ]

  // Each renderer is asked directly, not through syncTargets: none may rely on
  // a caller having validated the value first.
  it.each(renderers)('is refused by %s, whatever it holds', (_name, render) => {
    for (const [name, value] of HOSTILE) {
      expect(() => render(value), name).toThrow(/is not a base path/)
    }
  })

  it('writes no file at all', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vuestrata-base-hostile-'))
    try {
      for (const file of ['vercel.json', 'index.html']) {
        fs.copyFileSync(path.join(process.cwd(), file), path.join(root, file))
      }
      for (const dir of ['docker', 'public']) fs.mkdirSync(path.join(root, dir))
      const log = { success: vi.fn(), error: vi.fn(), info: vi.fn() }

      for (const [, value] of HOSTILE) {
        expect(() => sync.syncTargets({ root, log, basePath: value })).toThrow(/is not a base path/)
      }
      expect(fs.readdirSync(path.join(root, 'docker'))).toEqual([])
      expect(fs.readdirSync(path.join(root, 'public'))).toEqual([])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('renderNginxConf, for an app under /console/', () => {
  const conf: string = sync.renderNginxConf({ basePath: BASE })
  const blocks = nginxLocations(conf)
  const atRoot = nginxLocations(sync.renderNginxConf() as string)

  it('keeps `root` where it is: the image copies the build into <root>/console/', () => {
    expect(conf).toMatch(/^ {2}root \/usr\/share\/nginx\/html;$/m)
    expect(conf).not.toMatch(/^\s*alias \/usr/m)
  })

  it('puts every location of the app under the base', () => {
    const body = (location: string) => blocks.get(location) ?? []

    expect(addedHeader(body('= /console/index.html'), 'Cache-Control')).toBe('no-cache')
    expect(addedHeader(body('^~ /console/assets/'), 'Cache-Control')).toBe(
      'public, max-age=31536000, immutable',
    )
    expect(addedHeader(body('= /console/version.json'), 'Cache-Control')).toBe('no-store')
    expect(addedHeader(body('= /console/runtime-config.js'), 'Cache-Control')).toBe('no-store')
    expect(body('= /console/runtime-config.js')).toContain(
      'alias /tmp/vuestrata/runtime-config.js;',
    )
    expect(addedHeader(body('= /console/mockServiceWorker.js'), 'Service-Worker-Allowed')).toBe(
      '/console/',
    )

    // Each is the root's block, under the prefix: same directives, same headers.
    for (const [location, lines] of atRoot) {
      if (/^(?:=|\^~) \/(?!healthz)/.test(location)) {
        const under = location.replace(' /', ' /console/')
        expect(
          blocks.get(under)?.map((line) => line.replace('"/console/"', '"/"')),
          under,
        ).toEqual(lines)
        expect(blocks.has(location), location).toBe(false)
      }
    }
  })

  it('falls back to the app under the base only', () => {
    expect(blocks.get('/console/')).toContain('try_files $uri $uri/ /console/index.html;')
    // The one try_files that names index.html.
    expect(conf.match(/try_files .*index\.html;/g)).toEqual([
      'try_files $uri $uri/ /console/index.html;',
    ])
    expect(blocks.get('/')).not.toContain('try_files $uri $uri/ /index.html;')
  })

  it('answers /healthz at the root, where a probe on the container looks', () => {
    expect(blocks.get('= /healthz')).toEqual(atRoot.get('= /healthz'))
    expect(blocks.has('= /console/healthz')).toBe(false)
  })

  it('leaves the unrouted-API answer where it was: the API is not under the base', () => {
    expect(conf).toContain('include /tmp/vuestrata/api-location.conf;')
    expect(sync.renderApiLocationTemplate()).not.toContain('console')
  })

  it('sends the root of the server, and the prefix without its slash, to the app', () => {
    for (const location of ['= /', '= /console']) {
      const body = blocks.get(location) ?? []
      expect(body, location).toContain('return 302 /console/;')
      expect(addedHeader(body, 'Cache-Control'), location).toBe('no-store')
    }
  })

  it('cannot be made to redirect anywhere else', () => {
    // The target is a literal fixed at build. No variable is in it: not the
    // request path, not the query, not the Host header.
    const redirects = conf.match(/return 30\d [^;]*;/g) ?? []
    expect(redirects).toEqual(['return 302 /console/;', 'return 302 /console/;'])
    for (const redirect of redirects) expect(redirect).not.toContain('$')

    // And it is sent as a path. Without this nginx writes
    // http://<Host header>:8080/console/, which sends a visitor behind a proxy
    // to a port that is not public, and reflects a Host it was handed.
    expect(conf).toMatch(/^ {2}absolute_redirect off;$/m)
    expect(conf).not.toMatch(/\$(?:host|http_host|server_name|scheme|request_uri|args)/)
  })

  it('answers every other path outside the base with a 404, not with the app', () => {
    expect(blocks.get('/')).toEqual([SNIPPET_INCLUDE, 'return 404;'])
  })

  it('re-includes the security headers in every location, the new ones too', () => {
    // The root's blocks, plus the two redirects and the 404.
    expect(blocks.size).toBe(atRoot.size + 3)
    for (const [location, body] of blocks) expect(body, location).toContain(SNIPPET_INCLUDE)
  })

  it('has no location twice, which nginx refuses to start with', () => {
    const locations = [...conf.matchAll(/^\s*location\s+(.+?)\s*\{$/gm)].map(([, name]) => name)
    expect(new Set(locations).size).toBe(locations.length)
  })

  it('handles a base of several segments', () => {
    const deep = nginxLocations(sync.renderNginxConf({ basePath: '/apps/console/' }) as string)

    expect(deep.get('/apps/console/')).toContain('try_files $uri $uri/ /apps/console/index.html;')
    expect(deep.get('= /apps/console')).toContain('return 302 /apps/console/;')
    expect(deep.get('= /')).toContain('return 302 /apps/console/;')
    expect(deep.has('= /apps')).toBe(false)
  })

  it('is the committed file again when the base is the root', () => {
    for (const basePath of [undefined, '', '/']) {
      expect(sync.renderNginxConf({ basePath })).toBe(sync.renderNginxConf())
    }
    expect(sync.renderNginxConf()).not.toContain('absolute_redirect')
    expect(sync.renderNginxConf()).not.toContain('return 302')
    expect(sync.renderNginxConf()).not.toContain('return 404')
  })
})

describe('the hosted targets, for an app under /console/', () => {
  const file = sync.renderHeadersFile({ basePath: BASE }) as string
  const rules = headersFileRules(file)
  const vercel = new Map(
    (
      sync.renderVercelHeaders({ basePath: BASE }) as {
        source: string
        headers: { key: string; value: string }[]
      }[]
    ).map((rule) => [rule.source, rule.headers]),
  )

  it('_headers names the cache rules under the base', () => {
    expect([...rules.keys()]).toEqual([
      '/*',
      '/console/index.html',
      '/console/assets/*',
      '/console/version.json',
      '/console/runtime-config.js',
      '/console/mockServiceWorker.js',
    ])
    expect(rules.get('/console/assets/*')).toEqual([
      'Cache-Control: public, max-age=31536000, immutable',
    ])
    expect(rules.get('/console/index.html')).toEqual(['Cache-Control: no-cache'])
    expect(rules.get('/console/mockServiceWorker.js')).toContain(
      'Service-Worker-Allowed: /console/',
    )
  })

  it('the vercel.json block names the same paths, as route patterns', () => {
    expect([...vercel.keys()]).toEqual([
      '/(.*)',
      '/console/index\\.html',
      '/console/assets/(.*)',
      '/console/version\\.json',
      '/console/runtime-config\\.js',
      '/console/mockServiceWorker\\.js',
    ])
    expect(vercel.get('/console/assets/(.*)')).toEqual([
      { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
    ])
  })

  it('escapes a dot in the base, which a route pattern would read as any character', () => {
    const sources = (sync.renderVercelHeaders({ basePath: '/v1.2/' }) as { source: string }[]).map(
      (rule) => rule.source,
    )

    expect(sources).toContain('/v1\\.2/assets/(.*)')
  })

  it('still sends the security headers with every response of the host', () => {
    // The policy is about the origin, not about a path on it.
    expect(rules.get('/*')).toEqual(headersFileRules(sync.renderHeadersFile() as string).get('/*'))
    expect(vercel.get('/(.*)')).toEqual(
      (sync.renderVercelHeaders() as { headers: unknown }[])[0]!.headers,
    )
  })

  it('are the committed ones again when the base is the root', () => {
    for (const basePath of [undefined, '', '/']) {
      expect(sync.renderHeadersFile({ basePath })).toBe(sync.renderHeadersFile())
      expect(sync.renderVercelHeaders({ basePath })).toEqual(sync.renderVercelHeaders())
    }
  })
})

describe('the paths the image answers itself, under a base', () => {
  it('are the app’s files under the base, the probe, and the prefix with all above it', () => {
    expect(headers.reservedApiPaths('/apps/console/')).toEqual([
      '/healthz',
      '/apps/console/index.html',
      '/apps/console/assets',
      '/apps/console/version.json',
      '/apps/console/runtime-config.js',
      '/apps/console/mockServiceWorker.js',
      '/apps',
      '/apps/console',
    ])
  })

  it('reach the entrypoint through docker/runtime/keys', () => {
    const listed = (sync.renderRuntimeKeys({ basePath: BASE }) as string)
      .split('\n')
      .filter((line) => line.startsWith('reserved '))
      .map((line) => line.slice('reserved '.length))

    expect(listed).toEqual(headers.reservedApiPaths(BASE))
    expect(listed).toContain('/console')
  })

  it('cover every exact or prefix location of the server block', () => {
    const conf = sync.renderNginxConf({ basePath: BASE }) as string
    const locations = [...conf.matchAll(/location (?:=|\^~) (\S+) \{/g)]
      .map(([, route]) => route!.replace(/\/$/, ''))
      // `= /` is the root of the server, which `sameOriginApiPath` reads as
      // "no path prefix" and never routes.
      .filter(Boolean)

    expect(locations.sort()).toEqual([...headers.reservedApiPaths(BASE)].sort())
  })

  it('refuse an image whose own default API would take the app', () => {
    expect(() => sync.renderRuntimeKeys({ basePath: BASE, buildApiUrl: '/console' })).toThrow(
      /answers itself/,
    )
    expect(sync.renderRuntimeKeys({ basePath: BASE, buildApiUrl: '/console/api' })).toContain(
      'api VUESTRATA_API_URL /console/api',
    )
    expect(sync.renderRuntimeKeys({ basePath: BASE, buildApiUrl: '/api' })).toContain(
      'api VUESTRATA_API_URL /api',
    )
  })

  it('are the committed list again at the root', () => {
    expect(headers.reservedApiPaths('/')).toEqual(headers.reservedApiPaths())
    expect(sync.renderRuntimeKeys({ basePath: '/' })).toBe(sync.renderRuntimeKeys())
  })
})

describe('syncTargets, given a base path', () => {
  const roots: string[] = []
  const log = { success: vi.fn(), error: vi.fn(), info: vi.fn() }

  function project(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vuestrata-base-sync-'))
    roots.push(root)
    for (const file of ['vercel.json', 'index.html']) {
      fs.copyFileSync(path.join(process.cwd(), file), path.join(root, file))
    }
    for (const dir of ['docker', 'public']) fs.mkdirSync(path.join(root, dir))
    return root
  }
  const read = (root: string, file: string) => fs.readFileSync(path.join(root, file), 'utf8')

  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('renders every target under it, and the check given the same base agrees', () => {
    const root = project()

    sync.syncTargets({ root, log, basePath: BASE })

    expect(read(root, 'docker/nginx.conf')).toBe(sync.renderNginxConf({ basePath: BASE }))
    expect(read(root, 'public/_headers')).toContain('/console/assets/*')
    expect(read(root, 'docker/runtime/keys')).toContain('reserved /console\n')
    expect(JSON.parse(read(root, 'vercel.json')).headers[2].source).toBe('/console/assets/(.*)')
    // The page's policy is about origins: the base path is not in it.
    expect(read(root, 'index.html')).toBe(
      read(process.cwd(), 'index.html').replaceAll('\r\n', '\n'),
    )

    expect(sync.syncTargets({ root, log, check: true, basePath: BASE })).toEqual({
      drifted: [],
      written: [],
    })
  })

  it('reports files rendered for one base as drift from another', () => {
    const root = project()
    sync.syncTargets({ root, log, basePath: BASE })

    const { drifted } = sync.syncTargets({ root, log, check: true }) as { drifted: string[] }

    expect(drifted.sort()).toEqual(
      ['docker/nginx.conf', 'docker/runtime/keys', 'public/_headers', 'vercel.json'].sort(),
    )
  })

  it('leaves the two templates alone: they do not depend on the base', () => {
    const root = project()
    sync.syncTargets({ root, log })
    const before = ['security-headers.conf.template', 'api-location.conf.template'].map((file) =>
      read(root, `docker/runtime/${file}`),
    )

    const { written } = sync.syncTargets({ root, log, basePath: BASE }) as { written: string[] }

    expect(written.filter((file) => file.endsWith('.template'))).toEqual([])
    expect(
      ['security-headers.conf.template', 'api-location.conf.template'].map((file) =>
        read(root, `docker/runtime/${file}`),
      ),
    ).toEqual(before)
  })
})

describe('the command line', () => {
  /** Run the generator's `--check` against the repository, with an environment. */
  const check = (args: string[], env: Record<string, string> = {}) => {
    const inherited = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('VUESTRATA_')),
    )
    return spawnSync(process.execPath, [SCRIPT, '--check', ...args], {
      encoding: 'utf8',
      cwd: process.cwd(),
      env: { ...inherited, ...env },
    })
  }
  const output = (run: { stdout: string; stderr: string }) => `${run.stdout}${run.stderr}`

  it('checks the committed files against the root when it is given nothing', () => {
    expect(check([]).status).toBe(0)
  }, 60_000)

  it('ignores VUESTRATA_BASE_PATH in the shell unless told to read the environment', () => {
    // The committed targets must check the same on every machine.
    expect(check([], { VUESTRATA_BASE_PATH: '/console/' }).status).toBe(0)
  }, 60_000)

  it('reads it with --from-env, as the build does, and finds the committed files drifted', () => {
    const run = check(['--from-env'], { VUESTRATA_BASE_PATH: '/console/' })

    expect(run.status).toBe(1)
    expect(output(run)).toMatch(/docker\/nginx\.conf has drifted/)
    expect(output(run)).toMatch(/public\/_headers has drifted/)
  }, 60_000)

  it('takes --base-path, which wins over the environment', () => {
    expect(check(['--base-path=/console/']).status).toBe(1)
    expect(
      check(['--from-env', '--base-path=/'], { VUESTRATA_BASE_PATH: '/console/' }).status,
    ).toBe(0)
  }, 60_000)

  it('stops on a hostile value, naming the variable, before reading a target', () => {
    const run = check(['--base-path=/a/; return 200;/'])

    expect(run.status).toBe(1)
    expect(output(run)).toMatch(/VUESTRATA_BASE_PATH=.*is not a base path/)
    expect(output(run)).not.toMatch(/has drifted/)
  }, 60_000)
})
