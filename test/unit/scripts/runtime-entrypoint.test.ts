import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'

import { afterEach, describe, expect, it } from 'vite-plus/test'

// @ts-expect-error - the header scripts are plain ESM JavaScript with no type declarations.
import * as headers from '../../../scripts/security/headers.mjs'
// @ts-expect-error - the header scripts are plain ESM JavaScript with no type declarations.
import * as sync from '../../../scripts/security/sync-headers.mjs'

/**
 * `docker/entrypoint.d/40-vuestrata-runtime.sh`, run for real.
 *
 * The script is the only place where a value chosen at DEPLOY time is written
 * into three files nginx then serves or obeys: a JavaScript file, a header
 * snippet, and a block of server configuration. It runs in a container with no
 * Node, so it is POSIX sh, and it cannot share code with the generator whose
 * templates it fills. These tests are what holds the two together:
 *
 *   - for good values, what the script renders is compared with what the
 *     generator renders for the same inputs;
 *   - for hostile ones — a quote, `; `, a newline, `</script>`, a space — each
 *     of the three sinks is shown to be unreachable: the script exits non-zero,
 *     names the variable, and leaves no file behind for nginx to find.
 *
 * It runs under every POSIX shell on the PATH. `sh` is dash on the Linux CI
 * runners and bash-as-sh under Git for Windows; the image's is BusyBox ash.
 */

const SCRIPT = path.join(process.cwd(), 'docker/entrypoint.d/40-vuestrata-runtime.sh')

const OUTPUTS = ['runtime-config.js', 'security-headers.conf', 'api-location.conf'] as const

/** Forward slashes: the shell under Git for Windows reads `C:/…`, not `C:\…`. */
const posix = (file: string) => file.replaceAll('\\', '/')

const works = (shell: string) => spawnSync(shell, ['-c', 'exit 0']).status === 0

/**
 * `sh`, and one shell of the other family. `sh` is dash on the Linux runners
 * and bash under Git for Windows, so the second is whichever of the two `sh`
 * is not: two different implementations wherever the suite runs.
 */
const SHELLS = works('sh')
  ? [
      'sh',
      ...[
        spawnSync('sh', ['-c', 'printf %s "${BASH_VERSION:-}"'], { encoding: 'utf8' }).stdout
          ? 'dash'
          : 'bash',
      ].filter(works),
    ]
  : []

// Each test starts a few processes, and a process is slow to start on Windows.
const TIMEOUT = { timeout: 60_000 }

const BUILTIN_KEYS = [
  'VUESTRATA_API_URL',
  'VUESTRATA_APP_TITLE',
  'VUESTRATA_ERROR_REPORTING_DSN',
  'VUESTRATA_RELEASE',
  'VUESTRATA_SESSION_PERSISTENCE',
]

/** A project that names a DSN and a realtime endpoint by environment variable. */
const DEPLOY = {
  runtime: ['VUESTRATA_SUPABASE_URL'],
  headers: {
    connectSrc: ['https://login.acme.test'],
    connectSrcFromEnv: ['VUESTRATA_ERROR_REPORTING_DSN', 'VUESTRATA_SUPABASE_URL'],
    websocketFromEnv: ['VUESTRATA_SUPABASE_URL'],
  },
}

const dirs: string[] = []

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vuestrata-entrypoint-'))
  dirs.push(dir)
  return dir
}

/** The three files the image carries in /etc/vuestrata/runtime, as generated. */
function sourceDir(deploy: { runtime?: string[]; headers?: object } = DEPLOY): string {
  const dir = tempDir()
  const options = {
    headers: deploy.headers,
    runtimeKeys: headers.resolveRuntimeKeys(BUILTIN_KEYS, deploy.runtime ?? []),
  }
  fs.writeFileSync(path.join(dir, 'keys'), sync.renderRuntimeKeys(options))
  fs.writeFileSync(
    path.join(dir, 'security-headers.conf.template'),
    sync.renderNginxHeadersTemplate(options),
  )
  fs.writeFileSync(path.join(dir, 'api-location.conf.template'), sync.renderApiLocationTemplate())
  return dir
}

interface Run {
  status: number | null
  stdout: string
  stderr: string
  out: string
  files: string[]
  read: (file: (typeof OUTPUTS)[number]) => string
}

/** Start a "container": the script, a source dir, an empty /tmp/vuestrata, an environment. */
function start(
  shell: string,
  env: Record<string, string>,
  { source = sourceDir(), out = path.join(tempDir(), 'vuestrata') } = {},
): Run {
  // Only what a container would have. The developer's own VUESTRATA_* must not leak in.
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('VUESTRATA_')),
  )
  const result = spawnSync(shell, [posix(SCRIPT), posix(source), posix(out)], {
    encoding: 'utf8',
    env: { ...inherited, ...env },
  })
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    out,
    files: fs.existsSync(out) ? fs.readdirSync(out).sort() : [],
    read: (file) => fs.readFileSync(path.join(out, file), 'utf8'),
  }
}

const addHeaderLines = (snippet: string) =>
  snippet.split('\n').filter((line) => line.startsWith('add_header '))

/** The CSP `connect-src` sources of a rendered snippet. */
function connectSrc(snippet: string): string[] {
  return /connect-src ([^;"]*)/.exec(snippet)?.[1]?.trim().split(' ') ?? []
}

/** What the page would find in `window.__VUESTRATA_RUNTIME__` after loading the file. */
function evaluate(script: string): unknown {
  const window: Record<string, unknown> = {}
  vm.runInNewContext(script, { window })
  // Through JSON: the object was created in the other context's realm.
  return JSON.parse(JSON.stringify(window.__VUESTRATA_RUNTIME__))
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

it('has a POSIX shell to run under in CI', () => {
  // Without one every suite below is empty, and a green run would mean
  // nothing. CI always has `sh`; on Windows it comes with Git.
  if (process.env.CI) expect(SHELLS).toContain('sh')
})

// Registered only when there is no shell, so the report says why nothing ran.
it.runIf(SHELLS.length === 0)('was NOT exercised: no POSIX shell on PATH', () => {
  expect(SHELLS).toEqual([])
})

describe.each(SHELLS)('40-vuestrata-runtime.sh under %s', TIMEOUT, (shell) => {
  describe('a container with nothing set', () => {
    it('renders the three files, with the built-in defaults', () => {
      const run = start(shell, {})

      expect(run.stderr).toBe('')
      expect(run.status).toBe(0)
      expect(run.files).toEqual([...OUTPUTS].sort())
      // An empty overlay: the values inlined at build time apply.
      expect(run.read('runtime-config.js')).toBe('window.__VUESTRATA_RUNTIME__ = {};\n')
      expect(connectSrc(run.read('security-headers.conf'))).toEqual([
        "'self'",
        'https://login.acme.test',
      ])
      // No API URL means the app's default, /api, which is same-origin.
      expect(run.read('api-location.conf')).toContain(sync.renderApiLocation('/api'))
    })

    it('treats an empty variable as unset', () => {
      const run = start(shell, { VUESTRATA_API_URL: '', VUESTRATA_APP_TITLE: '' })

      expect(run.status).toBe(0)
      expect(evaluate(run.read('runtime-config.js'))).toEqual({})
    })

    it('leaves no placeholder behind', () => {
      const run = start(shell, {})

      for (const file of OUTPUTS) {
        expect(run.read(file)).not.toContain(headers.CONNECT_SRC_PLACEHOLDER)
        expect(run.read(file)).not.toContain(headers.API_PATH_PLACEHOLDER)
        // Nor a line saying the file is a template: it no longer is one.
        expect(run.read(file)).not.toMatch(/template/i)
      }
    })
  })

  describe('agrees with the generator', () => {
    it.each<{ name: string; env: Record<string, string> }>([
      { name: 'a same-origin path', env: { VUESTRATA_API_URL: '/api' } },
      { name: 'a nested same-origin path', env: { VUESTRATA_API_URL: '/backend/v1/' } },
      { name: 'the site root', env: { VUESTRATA_API_URL: '/' } },
      { name: 'a cross-origin API', env: { VUESTRATA_API_URL: 'https://api.staging.acme.test' } },
      {
        name: 'a URL with a path, a default port and capitals',
        env: { VUESTRATA_API_URL: 'https://API.Staging.Acme.test:443/v1/' },
      },
      { name: 'a non-default port', env: { VUESTRATA_API_URL: 'http://backend:8000/api' } },
      {
        name: 'a DSN with credentials and a realtime endpoint',
        env: {
          VUESTRATA_API_URL: 'https://api.acme.test',
          VUESTRATA_ERROR_REPORTING_DSN: 'https://abc123@o42.ingest.sentry.test/7',
          VUESTRATA_SUPABASE_URL: 'https://xyz.supabase.test',
        },
      },
      {
        name: 'two variables on the same origin',
        env: {
          VUESTRATA_API_URL: 'https://api.acme.test/v1',
          VUESTRATA_ERROR_REPORTING_DSN: 'https://api.acme.test/errors',
        },
      },
    ])('for $name', ({ env }) => {
      const run = start(shell, env)
      const reference = { apiUrl: env.VUESTRATA_API_URL, headers: DEPLOY.headers, env }

      expect(run.stderr).toBe('')
      expect(run.status).toBe(0)

      // The header snippet: byte for byte what the generator would write for
      // this environment, had it been there.
      expect(run.read('security-headers.conf')).toBe(sync.renderNginxHeadersSnippet(reference))

      // The unrouted-API answer: the blocks for that path, or none at all.
      const apiPath: string | null = headers.sameOriginApiPath(env.VUESTRATA_API_URL)
      if (apiPath) {
        expect(run.read('api-location.conf')).toContain(sync.renderApiLocation(apiPath))
      } else {
        expect(run.read('api-location.conf')).not.toMatch(/^\s*location /m)
      }

      // The overlay: exactly the runtime-overridable variables that were set.
      expect(evaluate(run.read('runtime-config.js'))).toEqual(env)
    })
  })

  describe('runtime-config.js', () => {
    it('is one assignment of a JSON object', () => {
      const run = start(shell, {
        VUESTRATA_API_URL: 'https://api.acme.test/v1?tenant=a&region=eu',
        VUESTRATA_APP_TITLE: 'Acme-Staging',
        VUESTRATA_RELEASE: 'v1.4.2+build.7',
        VUESTRATA_SESSION_PERSISTENCE: 'session',
      })
      const script = run.read('runtime-config.js')
      const literal = /^window\.__VUESTRATA_RUNTIME__ = (\{.*\});\n$/.exec(script)?.[1]

      expect(literal, script).toBeDefined()
      expect(JSON.parse(literal ?? '')).toEqual({
        VUESTRATA_API_URL: 'https://api.acme.test/v1?tenant=a&region=eu',
        VUESTRATA_APP_TITLE: 'Acme-Staging',
        VUESTRATA_RELEASE: 'v1.4.2+build.7',
        VUESTRATA_SESSION_PERSISTENCE: 'session',
      })
      expect(evaluate(script)).toEqual(JSON.parse(literal ?? ''))
    })

    it('carries a variable the project declared runtime-overridable', () => {
      const run = start(shell, { VUESTRATA_SUPABASE_URL: 'https://xyz.supabase.test' })

      expect(evaluate(run.read('runtime-config.js'))).toEqual({
        VUESTRATA_SUPABASE_URL: 'https://xyz.supabase.test',
      })
    })

    it('never carries a variable outside the generated list', () => {
      // Compile-time keys and anything else in the container's environment.
      const run = start(shell, {
        VUESTRATA_RUNTIME_MODE: 'demo',
        VUESTRATA_AUTH_ADAPTER: 'mock',
        VUESTRATA_NOT_DECLARED: 'x',
        DATABASE_PASSWORD: 'hunter2',
      })

      expect(run.status).toBe(0)
      expect(evaluate(run.read('runtime-config.js'))).toEqual({})
      expect(run.read('runtime-config.js')).not.toMatch(/hunter2|demo|mock/)
    })
  })

  // ── The three sinks ────────────────────────────────────────────────────────
  //
  // Each hostile value below would do something specific if it were written
  // out: close the JavaScript string, end the header and start another, end
  // the nginx directive, open a variable. None may get that far.

  const HOSTILE = [
    ['a double quote', 'x";alert(1);//'],
    ['a semicolon and a space', 'x; add_header X-Injected 1'],
    ['a newline', 'x\nX-Injected: 1'],
    ['a closing script tag', '</script><script>alert(1)</script>'],
    ['a space', 'two words'],
    ['a single quote', "x';alert(1);//"],
    ['a backslash', 'x\\"'],
    ['an nginx variable', 'x$host'],
    ['a semicolon alone', 'x;y'],
    ['a carriage return', 'x\rX-Injected: 1'],
    ['a trailing newline', 'x\n'],
    ['a tab', 'two\twords'],
    ['a shell substitution', '$(id)'],
    ['a backtick', '`id`'],
    ['a brace', 'x}server{'],
    ['a pipe', 'x|y'],
    ['a non-ASCII character', 'café'],
  ] as const

  /** The ones that mean something to nginx or to a header, for the two sinks that are either. */
  const HOSTILE_TO_NGINX = HOSTILE.slice(0, 8)

  function expectRefused(run: Run, variable: string) {
    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(1)
    expect(run.stderr).toContain(`error: ${variable}`)
    // Nothing for nginx to start with: its config includes two of these files.
    expect(run.files).toEqual([])
  }

  /**
   * An image whose key list has no `config` entry at all. `VUESTRATA_API_URL`
   * normally passes through the JavaScript sink first, which would refuse a bad
   * value before the other two ever saw it. Here nothing is written to
   * runtime-config.js, so what stops a value is the header sink's own check, or
   * the server configuration's.
   */
  function sinksOnly(): string {
    const source = sourceDir()
    fs.writeFileSync(
      path.join(source, 'keys'),
      [
        'api VUESTRATA_API_URL /api',
        'connect ERRORS_INGEST_URL',
        'websocket REALTIME_URL',
        '',
      ].join('\n'),
    )
    return source
  }

  describe('sink 1: the JavaScript file', () => {
    it.each(HOSTILE)('refuses %s in a value the app reads', (_, value) => {
      expectRefused(start(shell, { VUESTRATA_APP_TITLE: value }), 'VUESTRATA_APP_TITLE')
    })

    it.each([
      'VUESTRATA_API_URL',
      'VUESTRATA_ERROR_REPORTING_DSN',
      'VUESTRATA_RELEASE',
      'VUESTRATA_SESSION_PERSISTENCE',
      // Declared by the project: held to the same rule as the built-in ones.
      'VUESTRATA_SUPABASE_URL',
    ])('applies the same rule to %s', (variable) => {
      expectRefused(start(shell, { [variable]: 'https://a.test/"+alert(1)+"' }), variable)
    })
  })

  describe('sink 2: the security-header snippet', () => {
    it.each(HOSTILE_TO_NGINX)('refuses %s in the API URL', (_, value) => {
      const source = sinksOnly()
      const variable = 'VUESTRATA_API_URL'

      expectRefused(
        start(shell, { [variable]: `https://api.acme.test/${value}` }, { source }),
        variable,
      )
      expectRefused(
        start(shell, { [variable]: `https://${value}.acme.test` }, { source }),
        variable,
      )
    })

    it.each(HOSTILE_TO_NGINX)(
      'refuses %s in another variable whose origin joins connect-src',
      (_, value) => {
        const source = sinksOnly()

        expectRefused(
          start(shell, { ERRORS_INGEST_URL: `https://o1.sentry.test/${value}` }, { source }),
          'ERRORS_INGEST_URL',
        )
        expectRefused(
          start(shell, { REALTIME_URL: `https://rt.acme.test${value}` }, { source }),
          'REALTIME_URL',
        )
      },
    )

    it.each([
      ['no scheme', 'api.acme.test'],
      ['a scheme that is not http(s)', 'ftp://files.acme.test'],
      ['a javascript: URL', 'javascript://alert/1'],
      ['an empty host', 'https:///v1'],
      ['a host starting with a hyphen', 'https://-api.acme.test'],
      ['a host ending with a dot', 'https://api.acme.test./v1'],
      ['an empty label', 'https://api..acme.test'],
      ['an underscore in the host', 'https://my_api.acme.test'],
      ['a percent-encoded host', 'https://api%2eacme.test'],
      ['a port that is not a number', 'https://api.acme.test:port'],
      ['a port out of range', 'https://api.acme.test:70000'],
      ['an empty port', 'https://api.acme.test:/v1'],
      ['an IPv6 literal', 'https://[::1]:8443'],
    ])('refuses an API URL with %s', (_, value) => {
      expectRefused(
        start(shell, { VUESTRATA_API_URL: value }, { source: sinksOnly() }),
        'VUESTRATA_API_URL',
      )
    })

    it('takes the host after the credentials, as a browser does', () => {
      // `https://trusted@attacker` connects to attacker. The policy must name
      // the host the browser will use, not the one that reads like it.
      const env = {
        VUESTRATA_API_URL: 'https://api.acme.test@other.test/v1',
        VUESTRATA_ERROR_REPORTING_DSN: 'https://o1.sentry.test/x@decoy.test',
      }

      expect(connectSrc(start(shell, env).read('security-headers.conf'))).toEqual([
        "'self'",
        'https://login.acme.test',
        'https://other.test',
        'https://o1.sentry.test',
      ])
      expect(new URL(env.VUESTRATA_API_URL).host).toBe('other.test')
      expect(new URL(env.VUESTRATA_ERROR_REPORTING_DSN).host).toBe('o1.sentry.test')
    })

    it('writes only origins, whatever the URLs carried', () => {
      const run = start(shell, {
        VUESTRATA_API_URL: 'https://api.acme.test/v1?always=1#x',
        VUESTRATA_ERROR_REPORTING_DSN: 'https://key@o1.sentry.test/42?a=b',
      })
      const snippet = run.read('security-headers.conf')

      expect(snippet).not.toMatch(/v1|always=1|key@|\/42/)
      for (const line of addHeaderLines(snippet)) {
        expect(line).toMatch(/^add_header [A-Za-z-]+ "[^"$\\]*" always;$/)
      }
    })

    it('maps a WebSocket variable to its ws(s) origin', () => {
      const source = sinksOnly()
      const connect = (value: string) =>
        connectSrc(start(shell, { REALTIME_URL: value }, { source }).read('security-headers.conf'))

      expect(connect('https://rt.acme.test/socket')).toContain('wss://rt.acme.test')
      expect(connect('http://rt.acme.test:8080')).toContain('ws://rt.acme.test:8080')
      expect(connect('wss://rt.acme.test')).toContain('wss://rt.acme.test')
    })
  })

  describe('sink 3: the nginx server configuration', () => {
    it.each(HOSTILE_TO_NGINX)('refuses %s in a same-origin API path', (_, value) => {
      expectRefused(
        start(shell, { VUESTRATA_API_URL: `/api/${value}` }, { source: sinksOnly() }),
        'VUESTRATA_API_URL',
      )
    })

    it.each([
      ['a protocol-relative URL', '//evil.test/api'],
      ['an empty segment', '/api//v1'],
      ['a query', '/api?x=1'],
      ['a fragment', '/api#x'],
      ['a colon', '/api:8080'],
      ['an at sign', '/api@v1'],
    ])('refuses %s as a path', (_, value) => {
      const run = start(shell, { VUESTRATA_API_URL: value }, { source: sinksOnly() })

      expect(run.status).toBe(1)
      expect(run.stderr).toMatch(/Cannot route VUESTRATA_API_URL/)
      expect(run.files).toEqual([])
      // And the generator's rule is the same one.
      expect(() => headers.sameOriginApiPath(value)).toThrow(/Cannot route VUESTRATA_API_URL/)
    })

    it('writes the path into location lines and a JSON body, and nowhere else', () => {
      const run = start(shell, { VUESTRATA_API_URL: '/back-end/v1.2/~x_y/' })
      const conf = run.read('api-location.conf')

      expect(conf).toContain('location ^~ /back-end/v1.2/~x_y/ {')
      expect(conf).toContain('location = /back-end/v1.2/~x_y {')
      const body = /return 502 '(.+)';/.exec(conf)?.[1]
      expect(JSON.parse(body ?? '')).toMatchObject({ error: 'api_not_routed' })
      expect(body).not.toMatch(/['$\\]/)
    })
  })

  describe('a failed start', () => {
    it("removes the previous start's files, so nginx cannot come up on them", () => {
      // /tmp outlives a container in a pod: an emptyDir is kept across restarts.
      const source = sourceDir()
      const out = path.join(tempDir(), 'vuestrata')
      const first = start(shell, { VUESTRATA_API_URL: 'https://api.acme.test' }, { source, out })
      expect(first.files).toEqual([...OUTPUTS].sort())

      const second = start(shell, { VUESTRATA_API_URL: 'https://api.acme.test"' }, { source, out })

      expectRefused(second, 'VUESTRATA_API_URL')
    })

    it('stops on the first bad value even when the others are fine', () => {
      const run = start(shell, {
        VUESTRATA_API_URL: 'https://api.acme.test',
        VUESTRATA_APP_TITLE: 'Acme',
        VUESTRATA_SUPABASE_URL: 'https://xyz.supabase.test/ <script>',
      })

      expectRefused(run, 'VUESTRATA_SUPABASE_URL')
    })

    it('says which characters are allowed', () => {
      const run = start(shell, { VUESTRATA_APP_TITLE: 'Acme Console' })

      expect(run.stderr).toMatch(/only letters, digits and -_\.~:\/\?#@&\+,=%/)
    })
  })

  describe('an image that was built wrong', () => {
    it('stops when docker/runtime was not copied in', () => {
      const run = start(shell, {}, { source: path.join(tempDir(), 'missing') })

      expect(run.status).toBe(1)
      expect(run.stderr).toMatch(/keys is missing/)
    })

    it('stops on a header template without its placeholder', () => {
      const source = sourceDir()
      fs.writeFileSync(
        path.join(source, 'security-headers.conf.template'),
        sync.renderNginxHeadersSnippet(),
      )

      const run = start(shell, {}, { source })

      expect(run.status).toBe(1)
      expect(run.stderr).toMatch(/has no __VUESTRATA_CONNECT_SRC__ placeholder/)
      expect(run.files).toEqual([])
    })

    it.each([
      ['an entry it does not know', 'secret VUESTRATA_API_URL\n', /not a known entry/],
      ['a name that is not a variable', 'config VUESTRATA_A;id\n', /not a variable name/],
      ['a lower-case name', 'config path\n', /not a variable name/],
      ['a name starting with a digit', 'config 1VUESTRATA\n', /not a variable name/],
    ])('stops on a keys file with %s', (_, entry, message) => {
      const source = sourceDir()
      fs.appendFileSync(path.join(source, 'keys'), entry)

      const run = start(shell, {}, { source })

      expect(run.status).toBe(1)
      expect(run.stderr).toMatch(message)
      expect(run.files).toEqual([])
    })

    it('reads files checked out with CRLF line endings', () => {
      // A Windows checkout with autocrlf builds an image whose text files end
      // in \r\n. The variable must not become "VUESTRATA_API_URL\r".
      const source = sourceDir()
      for (const file of fs.readdirSync(source)) {
        const full = path.join(source, file)
        fs.writeFileSync(full, fs.readFileSync(full, 'utf8').replaceAll('\n', '\r\n'))
      }

      const run = start(shell, { VUESTRATA_API_URL: '/backend' }, { source })

      expect(run.stderr).toBe('')
      expect(run.status).toBe(0)
      expect(evaluate(run.read('runtime-config.js'))).toEqual({ VUESTRATA_API_URL: '/backend' })
      expect(run.read('security-headers.conf')).not.toContain('\r')
      expect(run.read('api-location.conf')).not.toContain('\r')
      expect(run.read('api-location.conf')).toContain('location ^~ /backend/ {')
    })
  })

  it('logs what it decided, and can be told to keep quiet', () => {
    const env = { VUESTRATA_API_URL: 'https://api.acme.test' }

    expect(start(shell, env).stdout).toMatch(/connect-src: 'self' https:\/\/api\.acme\.test/)
    expect(start(shell, { ...env, NGINX_ENTRYPOINT_QUIET_LOGS: '1' }).stdout).toBe('')
  })
})

describe('the committed image files', TIMEOUT, () => {
  it('are what the script is run against in the image', () => {
    // The tests above generate their own source directory. This one runs the
    // script against docker/runtime as committed: the files the Dockerfile
    // copies to /etc/vuestrata/runtime.
    const shell = SHELLS[0]
    if (!shell) return

    const run = start(
      shell,
      { VUESTRATA_API_URL: 'https://api.staging.acme.test' },
      { source: path.join(process.cwd(), 'docker/runtime') },
    )

    expect(run.stderr).toBe('')
    expect(run.status).toBe(0)
    expect(connectSrc(run.read('security-headers.conf'))).toContain('https://api.staging.acme.test')
  })

  it('is a script with a POSIX shebang and no carriage returns', () => {
    const script = fs.readFileSync(SCRIPT, 'utf8')

    expect(script.startsWith('#!/bin/sh\n')).toBe(true)
    expect(script).not.toContain('\r')
    // bash-only constructs the image's BusyBox ash would stop on.
    expect(script).not.toMatch(/\[\[|\bfunction \w+|<<<|\$\{[A-Za-z_]+,,\}|\blocal /)
  })
})
