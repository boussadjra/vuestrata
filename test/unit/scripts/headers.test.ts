import { describe, expect, it } from 'vite-plus/test'

// @ts-expect-error - the header scripts are plain ESM JavaScript with no type declarations.
import * as headers from '../../../scripts/security/headers.mjs'

/**
 * The header definition: the defaults, and what `headers` in
 * `deploy.config.ts` may add to them.
 *
 * A CSP fails open in the one way that matters here. A source that is not
 * valid — a URL with a path, a stray quote — makes a browser discard the WHOLE
 * directive, so a policy with one typo in `connect-src` restricts nothing and
 * reports nothing. Every source therefore has to be refused at generation time
 * or be exactly an origin.
 */

type HeaderList = [string, string][]

const cspOf = (options?: object): string => headers.buildCsp(options) as string
const headerMap = (options?: object) => new Map(headers.buildSecurityHeaders(options) as HeaderList)

/** One directive's sources. */
function directive(csp: string, name: string): string[] | undefined {
  return csp
    .split('; ')
    .map((entry) => entry.split(' '))
    .find(([entry]) => entry === name)
    ?.slice(1)
}

const DEFAULT_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' " +
  "https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; " +
  "img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; " +
  "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"

describe('the defaults', () => {
  it('are unchanged for a project that declares nothing', () => {
    // Byte for byte what shipped before deploy.config.ts existed.
    expect(cspOf()).toBe(DEFAULT_CSP)
    expect(cspOf({ headers: {} })).toBe(DEFAULT_CSP)
    expect(headers.buildSecurityHeaders()).toEqual([
      ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload'],
      ['Content-Security-Policy', DEFAULT_CSP],
      ['X-Content-Type-Options', 'nosniff'],
      ['X-Frame-Options', 'DENY'],
      ['Referrer-Policy', 'strict-origin-when-cross-origin'],
      ['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()'],
      ['Cross-Origin-Opener-Policy', 'same-origin'],
      ['Cross-Origin-Resource-Policy', 'same-origin'],
    ])
  })

  it('add the origin of a cross-origin API, never its path', () => {
    expect(directive(cspOf({ apiUrl: 'https://api.acme.test/v1' }), 'connect-src')).toEqual([
      "'self'",
      'https://api.acme.test',
    ])
    expect(directive(cspOf({ apiUrl: '/backend' }), 'connect-src')).toEqual(["'self'"])
  })
})

describe('connect-src', () => {
  it("is 'self', the configured origins, the API origin, then what the environment names", () => {
    const csp = cspOf({
      apiUrl: 'https://api.acme.test',
      headers: {
        connectSrc: ['https://login.acme.test', 'wss://realtime.acme.test'],
        connectSrcFromEnv: ['VUESTRATA_ERROR_REPORTING_DSN', 'VUESTRATA_SUPABASE_URL'],
        websocketFromEnv: ['VUESTRATA_SUPABASE_URL'],
      },
      env: {
        VUESTRATA_ERROR_REPORTING_DSN: 'https://key@o1.ingest.sentry.test/42',
        VUESTRATA_SUPABASE_URL: 'https://abc.supabase.test',
      },
      extraOrigins: ['https://extra.acme.test'],
    })

    expect(directive(csp, 'connect-src')).toEqual([
      "'self'",
      'https://login.acme.test',
      'wss://realtime.acme.test',
      'https://api.acme.test',
      'https://o1.ingest.sentry.test',
      'https://abc.supabase.test',
      'wss://abc.supabase.test',
      'https://extra.acme.test',
    ])
  })

  it('reads nothing from the environment unless it is handed one', () => {
    // The committed targets must not depend on the machine that generated them.
    const csp = cspOf({ headers: { connectSrcFromEnv: ['PATH', 'VUESTRATA_ERROR_REPORTING_DSN'] } })

    expect(directive(csp, 'connect-src')).toEqual(["'self'"])
  })

  it('skips a named variable that is unset or empty', () => {
    const csp = cspOf({
      headers: {
        connectSrcFromEnv: ['VUESTRATA_A', 'VUESTRATA_B'],
        websocketFromEnv: ['VUESTRATA_A'],
      },
      env: { VUESTRATA_B: '  ' },
    })

    expect(directive(csp, 'connect-src')).toEqual(["'self'"])
  })

  it('lists an origin once', () => {
    const csp = cspOf({
      apiUrl: 'https://api.acme.test/v1',
      headers: { connectSrc: ['https://api.acme.test'], connectSrcFromEnv: ['VUESTRATA_A'] },
      env: { VUESTRATA_A: 'https://API.acme.test:443/other' },
    })

    expect(directive(csp, 'connect-src')).toEqual(["'self'", 'https://api.acme.test'])
  })

  it('maps http to ws and https to wss for a WebSocket variable', () => {
    const connect = (value: string) =>
      directive(
        cspOf({ headers: { websocketFromEnv: ['VUESTRATA_RT'] }, env: { VUESTRATA_RT: value } }),
        'connect-src',
      )

    expect(connect('https://rt.acme.test/socket')).toEqual(["'self'", 'wss://rt.acme.test'])
    expect(connect('http://rt.acme.test:8080')).toEqual(["'self'", 'ws://rt.acme.test:8080'])
    expect(connect('wss://rt.acme.test')).toEqual(["'self'", 'wss://rt.acme.test'])
  })

  it.each([
    ['a wildcard subdomain', 'https://*.ingest.sentry.test'],
    ['a port', 'https://api.acme.test:8443'],
    ['plain http', 'http://api.internal'],
    ['a WebSocket origin', 'wss://realtime.acme.test'],
    ['a single-label host', 'http://backend:8000'],
    ['an IPv4 address', 'http://10.0.0.5:9000'],
  ])('accepts %s', (_, origin) => {
    expect(directive(cspOf({ headers: { connectSrc: [origin] } }), 'connect-src')).toEqual([
      "'self'",
      origin,
    ])
  })

  it('lower-cases a source', () => {
    expect(
      directive(cspOf({ headers: { connectSrc: ['HTTPS://Login.Acme.Test'] } }), 'connect-src'),
    ).toEqual(["'self'", 'https://login.acme.test'])
  })

  // One invalid source voids the whole directive in the browser, so each of
  // these must stop the generator instead of reaching a header.
  it.each([
    ['a URL with a path', 'https://api.acme.test/v1'],
    ['a trailing slash', 'https://api.acme.test/'],
    ['a query', 'https://api.acme.test?x=1'],
    ['credentials', 'https://key@o1.ingest.sentry.test'],
    ['no scheme', 'api.acme.test'],
    ['a scheme alone', 'https:'],
    ['another scheme', 'ftp://files.acme.test'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a bare wildcard', '*'],
    ['a wildcard host', 'https://*'],
    ['a wildcard in the middle', 'https://api.*.acme.test'],
    ['a keyword', "'unsafe-inline'"],
    ['a same-origin path', '/api'],
    ['an empty string', ''],
    ['a quote', 'https://api.acme.test"'],
    ['a single quote', "https://api.acme.test'"],
    ['a semicolon', 'https://api.acme.test; script-src *'],
    ['a space', 'https://api.acme.test https://evil.test'],
    ['a newline', 'https://api.acme.test\nX-Injected: 1'],
    ['an nginx variable', 'https://$host'],
    ['a closing script tag', 'https://a.test</script>'],
    ['a port out of range', 'https://api.acme.test:123456'],
    ['a five-digit port out of range', 'https://api.acme.test:99999'],
    ['port 65536', 'https://api.acme.test:65536'],
    ['port 0', 'https://api.acme.test:0'],
    ['a port with a leading zero', 'https://api.acme.test:0443'],
    ['an empty port', 'https://api.acme.test:'],
    ['a wildcard under a single label', 'https://*.com'],
    ['a wildcard under a single label, with a port', 'https://*.test:8443'],
    ['a label starting with a hyphen', 'https://-api.acme.test'],
    ['an underscore in the host', 'https://my_api.acme.test'],
    ['an IPv6 literal', 'https://[::1]:8443'],
    ['a number', 8080],
  ])('refuses %s', (_, source) => {
    expect(() => cspOf({ headers: { connectSrc: [source] } })).toThrow(/headers\.connectSrc\[0\]/)
    expect(() => headers.buildSecurityHeaders({ headers: { connectSrc: [source] } })).toThrow(
      /Invalid deploy\.config\.ts headers/,
    )
  })

  it.each([
    ['the highest port', 'https://api.acme.test:65535'],
    ['port 1', 'https://api.acme.test:1'],
    ['a wildcard under two labels', 'https://*.acme.test'],
    ['a wildcard with a port', 'wss://*.realtime.acme.test:8443'],
  ])('accepts %s', (_, origin) => {
    expect(directive(cspOf({ headers: { connectSrc: [origin] } }), 'connect-src')).toContain(origin)
  })

  it('says why a wildcard or a port was refused', () => {
    expect(() => cspOf({ headers: { connectSrc: ['https://*.com'] } })).toThrow(
      /would allow every site under "com"/,
    )
    expect(() => cspOf({ headers: { connectSrc: ['https://a.test:99999'] } })).toThrow(
      /from 1 to 65535/,
    )
  })

  // A wildcard is something a project writes down in `connectSrc`, on purpose.
  // The value of a variable is a URL: `*` there is a mistake or an attack, and
  // the container entrypoint refuses the same values.
  it.each([
    ['a wildcard host', 'https://*.acme.test/v1'],
    ['a wildcard under a public suffix', 'https://*.com'],
    ['port 0', 'https://api.acme.test:0/v1'],
    ['a port out of range', 'https://api.acme.test:99999'],
  ])('refuses %s in a URL it derives an origin from', (_, url) => {
    expect(() => cspOf({ apiUrl: url })).toThrow()
    expect(() => headers.connectSrcFor(url)).toThrow()
    for (const option of ['connectSrcFromEnv', 'websocketFromEnv']) {
      expect(() =>
        cspOf({ headers: { [option]: ['VUESTRATA_A'] }, env: { VUESTRATA_A: url } }),
      ).toThrow()
    }
  })

  it('reads a port in a URL as a URL parser does', () => {
    expect(headers.connectSrcFor('https://api.acme.test:0443/v1')).toBe('https://api.acme.test')
    expect(headers.connectSrcFor('http://api.acme.test:08080')).toBe('http://api.acme.test:8080')
  })

  it('says how to fix a URL that has an origin in it', () => {
    expect(() => cspOf({ headers: { connectSrc: ['https://api.acme.test/v1'] } })).toThrow(
      /write "https:\/\/api\.acme\.test"/,
    )
  })

  it('refuses an extra origin that is not one', () => {
    expect(() => cspOf({ extraOrigins: ['https://a.test/path'] })).toThrow(/extraOrigins\[0\]/)
  })

  it.each([
    ['not a URL', 'api.acme.test/v1', /neither an absolute URL nor a same-origin path/],
    ['another scheme', 'ftp://files.acme.test', /scheme must be one of http, https/],
    ['a javascript: URL', 'javascript:alert(1)', /scheme must be one of http, https/],
    ['a host no source can name', 'https://[::1]:8443/api', /not an origin/],
  ])('refuses an API URL that is %s', (_, apiUrl, message) => {
    expect(() => cspOf({ apiUrl })).toThrow(message)
    expect(() => headers.connectSrcFor(apiUrl)).toThrow(message)
  })

  it.each([
    ['a quote', 'https://a.test";alert(1)//'],
    ['a semicolon and a space', 'https://a.test; add_header X y'],
    ['a newline', 'https://a.test\nX-Injected: 1'],
    ['a closing script tag', 'https://a.test</script>'],
    ['a space', 'https://a.test evil.test'],
  ])('never lets %s from the environment into the policy', (_, value) => {
    const render = () =>
      cspOf({ headers: { connectSrcFromEnv: ['VUESTRATA_A'] }, env: { VUESTRATA_A: value } })

    // Either refused outright, or reduced to the origin the URL parser found:
    // what reaches the header is never the text that was supplied.
    let csp: string
    try {
      csp = render()
    } catch {
      return
    }
    expect(csp).not.toMatch(/["\n<>]|alert|add_header|X-Injected|evil/)
    expect(directive(csp, 'connect-src')).toEqual(["'self'", 'https://a.test'])
  })

  it.each(['lower_case', 'WITH-DASH', '1LEADING', 'A B', '$(id)', ''])(
    'refuses %j as a variable name',
    (name) => {
      expect(() => cspOf({ headers: { connectSrcFromEnv: [name] } })).toThrow(
        /not an environment variable name/,
      )
      expect(() => cspOf({ headers: { websocketFromEnv: [name] } })).toThrow(
        /not an environment variable name/,
      )
    },
  )
})

describe('the other configurable directives', () => {
  it('adds image, font and frame sources to the defaults', () => {
    const csp = cspOf({
      headers: {
        imgSrc: ['https://images.acme.test', 'https:'],
        fontSrc: ['https://fonts.acme.test', 'data:'],
        frameSrc: ['https://js.stripe.test'],
      },
    })

    expect(directive(csp, 'img-src')).toEqual([
      "'self'",
      'data:',
      'blob:',
      'https://images.acme.test',
      'https:',
    ])
    expect(directive(csp, 'font-src')).toEqual([
      "'self'",
      'https://fonts.gstatic.com',
      'https://fonts.acme.test',
      'data:',
    ])
    expect(directive(csp, 'frame-src')).toEqual(["'self'", 'https://js.stripe.test'])
  })

  it('emits no frame-src until one is configured', () => {
    expect(directive(cspOf(), 'frame-src')).toBeUndefined()
  })

  it.each([
    ['imgSrc', "'unsafe-inline'"],
    ['imgSrc', 'https://images.acme.test/avatars'],
    ['fontSrc', 'https:'],
    ['frameSrc', 'data:'],
    ['frameSrc', '*'],
  ])('refuses %s: %s', (option, source) => {
    expect(() => cspOf({ headers: { [option]: [source] } })).toThrow(
      new RegExp(`headers\\.${option}\\[0\\]`),
    )
  })

  it('refuses an option it does not know, rather than ignoring a typo', () => {
    expect(() => cspOf({ headers: { connectsrc: ['https://a.test'] } })).toThrow(
      /headers\.connectsrc: unknown option/,
    )
    expect(() => cspOf({ headers: { scriptSrc: ['https://cdn.test'] } })).toThrow(/unknown option/)
  })

  it('reports every problem at once', () => {
    const render = () =>
      cspOf({
        headers: {
          connectSrc: ['https://a.test/x'],
          imgSrc: 'https://images.test',
          crossOriginOpenerPolicy: 'none',
        },
      })

    expect(render).toThrow(/headers\.connectSrc\[0\]/)
    expect(render).toThrow(/headers\.imgSrc: expected a list/)
    expect(render).toThrow(/headers\.crossOriginOpenerPolicy/)
  })
})

describe('Cross-Origin-Opener-Policy', () => {
  it('defaults to same-origin', () => {
    expect(headerMap().get('Cross-Origin-Opener-Policy')).toBe('same-origin')
  })

  it.each(headers.COOP_VALUES as string[])('can be set to %s', (value) => {
    // same-origin-allow-popups is what MSAL loginPopup and Firebase
    // signInWithPopup need: the default cuts window.opener across origins.
    expect(
      headerMap({ headers: { crossOriginOpenerPolicy: value } }).get('Cross-Origin-Opener-Policy'),
    ).toBe(value)
  })

  it.each(['same-site', 'SAME-ORIGIN', 'same-origin; report-to="x"', '', 1])(
    'refuses %j',
    (value) => {
      expect(() => headerMap({ headers: { crossOriginOpenerPolicy: value } })).toThrow(
        /crossOriginOpenerPolicy/,
      )
    },
  )
})

describe('frame-ancestors', () => {
  it("defaults to 'none', with X-Frame-Options: DENY", () => {
    expect(directive(cspOf(), 'frame-ancestors')).toEqual(["'none'"])
    expect(headerMap().get('X-Frame-Options')).toBe('DENY')
  })

  it("allows the app's own origin, as SAMEORIGIN for the old header", () => {
    const options = { headers: { frameAncestors: ["'self'"] } }

    expect(directive(cspOf(options), 'frame-ancestors')).toEqual(["'self'"])
    expect(headerMap(options).get('X-Frame-Options')).toBe('SAMEORIGIN')
  })

  it('drops X-Frame-Options when the list is something it cannot express', () => {
    // A DENY beside it would contradict the policy in a browser that reads
    // only the old header.
    const options = { headers: { frameAncestors: ["'self'", 'https://portal.acme.test'] } }

    expect(directive(cspOf(options), 'frame-ancestors')).toEqual([
      "'self'",
      'https://portal.acme.test',
    ])
    expect(headerMap(options).has('X-Frame-Options')).toBe(false)
  })

  it.each([
    ["'none' beside another source", ["'none'", 'https://portal.acme.test']],
    ['a wildcard', ['*']],
    ['a URL with a path', ['https://portal.acme.test/embed']],
  ])('refuses %s', (_, frameAncestors) => {
    expect(() => cspOf({ headers: { frameAncestors } })).toThrow(/frameAncestors/)
  })
})

describe('the <meta> policy', () => {
  const meta = (options?: object) => cspOf({ ...options, forMeta: true })

  it("restricts connections to the app's own origin by default", () => {
    // A host that sends no headers has only this tag. It used to read
    // `connect-src *` for every build, for the benefit of the one deployment
    // that always sends the header.
    expect(directive(meta(), 'connect-src')).toEqual(["'self'"])
  })

  it('names the same origins as the header, for the same inputs', () => {
    const options = {
      apiUrl: 'https://api.acme.test/v1',
      headers: {
        connectSrc: ['https://login.acme.test'],
        connectSrcFromEnv: ['VUESTRATA_A'],
        websocketFromEnv: ['VUESTRATA_A'],
      },
      env: { VUESTRATA_A: 'https://a.test/x' },
    }

    expect(directive(meta(options), 'connect-src')).toEqual(
      directive(cspOf(options), 'connect-src'),
    )
    expect(directive(meta(options), 'connect-src')).toEqual([
      "'self'",
      'https://login.acme.test',
      'https://api.acme.test',
      'https://a.test',
      'wss://a.test',
    ])
  })

  it('is the header without frame-ancestors, and nothing else differs', () => {
    const options = { apiUrl: 'https://api.acme.test', headers: { imgSrc: ['https:'] } }

    expect(meta(options)).toBe(cspOf(options).replace("frame-ancestors 'none'; ", ''))
  })

  describe('for an artifact whose API URL is set at start', () => {
    const atStart = (options?: object) => meta({ ...options, runtimeConfig: true })

    it('leaves connections to the header, whatever the build knew', () => {
      // The browser enforces the tag as well as the header. The API origin of
      // a container is decided at start, so a `connect-src 'self'` in the page
      // would block what the container's header allows.
      expect(directive(atStart(), 'connect-src')).toEqual(['*'])
      expect(
        directive(
          atStart({
            apiUrl: 'https://api.acme.test',
            headers: {
              connectSrc: ['https://login.acme.test'],
              connectSrcFromEnv: ['VUESTRATA_A'],
            },
            env: { VUESTRATA_A: 'https://a.test' },
          }),
          'connect-src',
        ),
      ).toEqual(['*'])
    })

    it('states connect-src rather than omitting it', () => {
      // Omitted, it would fall back to default-src 'self' and block the same
      // requests.
      expect(directive(atStart(), 'default-src')).toEqual(["'self'"])
      expect(directive(atStart(), 'connect-src')).toBeDefined()
    })

    it('changes nothing but connect-src', () => {
      expect(atStart().replace('connect-src *', "connect-src 'self'")).toBe(meta())
    })

    it('never reaches a header: the flag is about the tag alone', () => {
      expect(cspOf({ runtimeConfig: true })).toBe(DEFAULT_CSP)
      expect(headerMap({ runtimeConfig: true }).get('Content-Security-Policy')).toBe(DEFAULT_CSP)
    })
  })

  it('leaves out frame-ancestors, which a meta tag cannot express', () => {
    expect(directive(meta(), 'frame-ancestors')).toBeUndefined()
    expect(
      directive(meta({ headers: { frameAncestors: ["'self'"] } }), 'frame-ancestors'),
    ).toBeUndefined()
  })

  it('keeps every other restriction, configured sources included', () => {
    const csp = meta({ headers: { imgSrc: ['https://images.acme.test'] } })

    expect(directive(csp, 'script-src')).toEqual(["'self'"])
    expect(directive(csp, 'object-src')).toEqual(["'none'"])
    expect(directive(csp, 'img-src')).toContain('https://images.acme.test')
  })
})

describe('the nginx template', () => {
  const template = (options?: object) => cspOf({ ...options, template: true })

  it('ends connect-src with the placeholder the entrypoint fills', () => {
    expect(directive(template(), 'connect-src')).toEqual([
      "'self'",
      headers.CONNECT_SRC_PLACEHOLDER,
    ])
  })

  it('carries what is known at build time, and nothing from the environment', () => {
    const options = {
      apiUrl: 'https://api.acme.test',
      headers: { connectSrc: ['https://login.acme.test'], connectSrcFromEnv: ['VUESTRATA_A'] },
      env: { VUESTRATA_A: 'https://a.test' },
    }

    // One image serves every environment: neither the API origin nor a
    // variable's value may be baked into it.
    expect(directive(template(options), 'connect-src')).toEqual([
      "'self'",
      'https://login.acme.test',
      headers.CONNECT_SRC_PLACEHOLDER,
    ])
  })
})

describe('resolveRuntimeKeys', () => {
  it('is the built-in keys followed by the project’s, once each', () => {
    expect(
      headers.resolveRuntimeKeys(
        ['VUESTRATA_API_URL', 'VUESTRATA_RELEASE'],
        ['VUESTRATA_SUPABASE_URL', 'VUESTRATA_RELEASE'],
      ),
    ).toEqual(['VUESTRATA_API_URL', 'VUESTRATA_RELEASE', 'VUESTRATA_SUPABASE_URL'])
  })

  it.each(['SUPABASE_URL', 'VUESTRATA_x', 'VUESTRATA_A B', 'VUESTRATA_A;id', 'VUESTRATA_', 7])(
    'refuses %j: the entrypoint reads these names from its environment',
    (key) => {
      expect(() => headers.resolveRuntimeKeys([], [key])).toThrow(/runtime key/)
    },
  )

  it('refuses a runtime list that is not a list', () => {
    expect(() => headers.resolveRuntimeKeys([], 'VUESTRATA_A')).toThrow(/must be a list/)
  })
})

describe('sameOriginApiPath', () => {
  it.each([
    ['/api', '/api'],
    ['/api/', '/api'],
    ['/backend/v1//', '/backend/v1'],
    ['/', null],
    ['https://api.acme.test/api', null],
    [undefined, null],
  ])('%j → %j', (apiUrl, expected) => {
    expect(headers.sameOriginApiPath(apiUrl)).toBe(expected)
  })

  it.each(['/api/../admin', '/api/./v1', '/..', '/.', '/api/..', '/../api'])(
    'refuses the dot segment in %j',
    (apiUrl) => {
      expect(() => headers.sameOriginApiPath(apiUrl)).toThrow(/"\." or "\.\." segment/)
    },
  )

  it.each(['/.well-known/api', '/api.v2', '/v1..2', '/...'])(
    'accepts %j, where the dots are part of a name',
    (apiUrl) => {
      expect(headers.sameOriginApiPath(apiUrl)).toBe(apiUrl)
    },
  )

  it('refuses every path the server block has a location of its own for', () => {
    // nginx would stop on "duplicate location" and name no variable.
    const reserved: string[] = headers.reservedApiPaths()

    expect([...reserved].sort()).toEqual(
      [
        '/assets',
        '/healthz',
        '/index.html',
        '/mockServiceWorker.js',
        '/runtime-config.js',
        '/version.json',
      ].sort(),
    )
    for (const path of reserved) {
      expect(() => headers.sameOriginApiPath(path)).toThrow(/a path this server answers itself/)
      expect(() => headers.sameOriginApiPath(`${path}/`)).toThrow(/answers itself/)
    }
    expect(headers.sameOriginApiPath('/assets/api')).toBe('/assets/api')
  })
})
