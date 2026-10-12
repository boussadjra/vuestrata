import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import {
  anonymousForbidden,
  DEFAULT_LOGIN_PATH,
  DRF_ANONYMOUS_MESSAGES,
  drfCsrfFailed,
  loginRedirect,
  statusMeans,
  unauthorizedStatus,
} from '@/lib/api/classifiers'
import { csrfPresets, DEFAULT_CSRF_STRATEGY } from '@/lib/api/csrf'
import { dialects, extendDialect, type CollectionDialect } from '@/lib/api/dialects'
import {
  drfErrorMapper,
  laravelErrorMapper,
  nestErrorMapper,
  problemJsonErrorMapper,
  springBootErrorMapper,
  vuestrataErrorMapper,
} from '@/lib/api/error-mappers'
import {
  currentApiIntegration,
  DEFAULT_API_INTEGRATION,
  defineApiOverrides,
  resolveApiIntegration,
  type ApiBackendPreset,
  type ApiErrorMapper,
  type ApiRequestContext,
  type ApiRequestHook,
  type ApiResponseClassifier,
  type ApiResponseContext,
} from '@/lib/api/integration'
import { presets } from '@/lib/api/presets'
import {
  createRequestId,
  createTraceparent,
  DEFAULT_TRACING,
  resolveTracing,
} from '@/lib/api/tracing'
import { __resetRuntimeSlots, installApiIntegration, tryGetApiIntegration } from '@/lib/runtime'

import { resetRuntimeState } from '../../utils/reset-runtime-state'

/**
 * How `app/config/api.overrides.ts` becomes what the client reads.
 *
 * The order in which a preset and the project's own options combine is a
 * contract: a project that lists its mapper before a preset's relies on it
 * being asked first, and one that sets a header the preset also sets relies on
 * winning. Nothing type-checks an order, so it is pinned here.
 */

afterEach(async () => {
  // The slot is module state; put back what `test/setup.ts` installs.
  __resetRuntimeSlots()
  await resetRuntimeState()
})

function response(overrides: Partial<ApiResponseContext> = {}): ApiResponseContext {
  return {
    url: 'http://localhost/api/orders',
    method: 'GET',
    status: 200,
    ok: true,
    headers: new Headers(),
    contentType: 'application/json',
    redirected: false,
    responseUrl: 'http://localhost/api/orders',
    body: undefined,
    expectsJson: true,
    ...overrides,
  }
}

/**
 * Run request hooks the way the client does, and return the headers they left.
 * `fromCaller` is what the call itself passed in its `headers` option.
 */
async function headersAfter(hooks: readonly ApiRequestHook[], fromCaller: HeadersInit = {}) {
  const headers = new Headers(fromCaller)
  const caller = new Headers(fromCaller)
  const context: ApiRequestContext = {
    url: 'http://localhost/api/orders',
    method: 'GET',
    headers,
    setHeader: (name, value) => {
      if (value === null || value === undefined) headers.delete(name)
      else headers.set(name, value)
    },
    hasCallerHeader: (name) => caller.has(name),
  }
  for (const hook of hooks) await hook(context)
  return Object.fromEntries(headers.entries())
}

describe('defineApiOverrides', () => {
  it('is an identity function', () => {
    const overrides = { timeoutMs: 5_000 }
    expect(defineApiOverrides(overrides)).toBe(overrides)
  })
})

describe('the defaults', () => {
  it('are what the client did before the seam existed', () => {
    expect(DEFAULT_API_INTEGRATION).toEqual({
      requestHooks: [],
      classifiers: [unauthorizedStatus],
      errorMappers: [vuestrataErrorMapper],
      csrf: { source: 'meta', name: 'csrf-token', header: 'X-CSRF-Token' },
      timeoutMs: 15_000,
      tracing: {
        requestId: false,
        requestIdHeader: 'X-Request-Id',
        traceparent: false,
        sampled: true,
      },
      redirect: 'follow',
    })
  })

  it('are what an empty overrides file resolves to', () => {
    expect(resolveApiIntegration(defineApiOverrides({}))).toEqual(DEFAULT_API_INTEGRATION)
    expect(resolveApiIntegration()).toEqual(DEFAULT_API_INTEGRATION)
  })

  it('are what core/lib reads until the bootstrap installs something', () => {
    __resetRuntimeSlots()
    expect(tryGetApiIntegration()).toBeNull()
    expect(currentApiIntegration()).toBe(DEFAULT_API_INTEGRATION)

    const installed = resolveApiIntegration({ timeoutMs: 3_000 })
    installApiIntegration(installed)
    expect(currentApiIntegration()).toBe(installed)

    __resetRuntimeSlots()
    expect(currentApiIntegration()).toBe(DEFAULT_API_INTEGRATION)
  })
})

describe('how a preset and the project options combine', () => {
  const presetClassifier: ApiResponseClassifier = () => null
  const ownClassifier: ApiResponseClassifier = () => null
  const presetMapper: ApiErrorMapper = () => null
  const ownMapper: ApiErrorMapper = () => null

  const calls: string[] = []
  const note = (name: string): ApiRequestHook => {
    return () => void calls.push(name)
  }

  const backend: ApiBackendPreset = {
    name: 'acme',
    headers: { 'X-Client': 'preset', 'X-Preset-Only': 'yes' },
    request: [note('preset hook')],
    classify: [presetClassifier],
    errors: [presetMapper],
    csrf: csrfPresets.django,
    timeoutMs: 20_000,
    tracing: { requestId: true },
  }

  afterEach(() => {
    calls.length = 0
  })

  it('asks the project classifiers first, then the preset, then the built-in', () => {
    const { classifiers } = resolveApiIntegration({ backend, classify: ownClassifier })

    expect(classifiers).toEqual([ownClassifier, presetClassifier, unauthorizedStatus])
  })

  it('asks the project error mappers first, and the Vuestrata mapper always last', () => {
    const { errorMappers } = resolveApiIntegration({ backend, errors: [ownMapper] })

    expect(errorMappers).toEqual([ownMapper, presetMapper, vuestrataErrorMapper])
  })

  it('runs headers before hooks, and the preset before the project', async () => {
    const appHook = note('app hook')
    const { requestHooks } = resolveApiIntegration(
      {
        backend,
        headers: { 'X-Client': 'project', 'X-Tenant': () => 'acme-co' },
        request: [note('project hook')],
      },
      { requestHooks: [appHook] },
    )

    const headers = await headersAfter(requestHooks)

    // The project set the same header after the preset did, so it wins.
    expect(headers).toEqual({
      'x-client': 'project',
      'x-preset-only': 'yes',
      'x-tenant': 'acme-co',
    })
    expect(calls).toEqual(['app hook', 'preset hook', 'project hook'])
    // What the app layer contributes runs before both.
    expect(requestHooks[0]).toBe(appHook)
  })

  it('sends no header for a function with nothing to say', async () => {
    const { requestHooks } = resolveApiIntegration({
      backend: { name: 'acme', headers: { 'X-Tenant': 'preset-tenant' } },
      headers: { 'X-Tenant': () => undefined, 'X-Region': () => '', 'X-Org': () => null },
    })

    // Nothing to say is not "remove it": the preset's value stays.
    expect(await headersAfter(requestHooks)).toEqual({ 'x-tenant': 'preset-tenant' })
  })

  it('leaves a header the call set itself alone, without asking the function', async () => {
    const tenant = vi.fn(() => 'from-the-store')
    const { requestHooks } = resolveApiIntegration({
      backend: { name: 'acme', headers: { 'X-Tenant': 'preset-tenant' } },
      headers: { 'X-Tenant': tenant, 'X-Client': 'web' },
    })

    expect(await headersAfter(requestHooks, { 'x-tenant': 'from-the-call' })).toEqual({
      'x-tenant': 'from-the-call',
      'x-client': 'web',
    })
    expect(tenant).not.toHaveBeenCalled()
  })

  it('gives a header function the request it is for', async () => {
    const seen: string[] = []
    const { requestHooks } = resolveApiIntegration({
      headers: {
        'X-Key': (request) => {
          seen.push(`${request.method} ${request.url}`)
          return 'k'
        },
      },
    })

    await headersAfter(requestHooks)

    expect(seen).toEqual(['GET http://localhost/api/orders'])
  })

  it('takes csrf, timeoutMs and tracing from the preset when the project sets none', () => {
    expect(resolveApiIntegration({ backend })).toMatchObject({
      csrf: csrfPresets.django,
      timeoutMs: 20_000,
      tracing: { requestId: true, requestIdHeader: 'X-Request-Id', traceparent: false },
    })
  })

  it('replaces csrf, timeoutMs and tracing whole when the project sets them', () => {
    const resolved = resolveApiIntegration({
      backend,
      csrf: { source: 'none' },
      timeoutMs: 4_000,
      tracing: { traceparent: true },
    })

    expect(resolved.csrf).toEqual({ source: 'none' })
    expect(resolved.timeoutMs).toBe(4_000)
    // Replaced, not merged: the preset's `requestId: true` is gone.
    expect(resolved.tracing).toEqual({
      requestId: false,
      requestIdHeader: 'X-Request-Id',
      traceparent: true,
      sampled: true,
    })
  })

  it('follows redirects unless the project or the preset says to refuse them', () => {
    expect(resolveApiIntegration({}).redirect).toBe('follow')
    expect(resolveApiIntegration({ redirect: 'error' }).redirect).toBe('error')
    expect(resolveApiIntegration({ backend: { ...backend, redirect: 'error' } }).redirect).toBe(
      'error',
    )
    expect(
      resolveApiIntegration({ backend: { ...backend, redirect: 'error' }, redirect: 'follow' })
        .redirect,
    ).toBe('follow')
  })

  it('keeps prime state only for a strategy that can prime, one per resolution', () => {
    expect(resolveApiIntegration({}).csrfPrime).toBeUndefined()
    expect(resolveApiIntegration({ csrf: csrfPresets.django }).csrfPrime).toBeUndefined()

    const first = resolveApiIntegration({ backend: presets.laravel })
    const second = resolveApiIntegration({ backend: presets.laravel })
    expect(first.csrfPrime).toEqual({ inFlight: null, retryAfter: 0 })
    // Never shared: what one installed integration learned is not another's.
    expect(second.csrfPrime).not.toBe(first.csrfPrime)
  })

  it('lets a project adjust one field of a preset strategy by spreading it', () => {
    const { csrf } = resolveApiIntegration({
      backend: presets.laravel,
      csrf: { ...csrfPresets.laravel, prime: '/api/csrf-cookie' },
    })

    expect(csrf).toMatchObject({ source: 'cookie', name: 'XSRF-TOKEN', prime: '/api/csrf-cookie' })
  })

  it('accepts one hook, classifier or mapper without a list', () => {
    const hook = note('single')
    const resolved = resolveApiIntegration({
      request: hook,
      classify: ownClassifier,
      errors: ownMapper,
    })

    expect(resolved.requestHooks).toEqual([hook])
    expect(resolved.classifiers).toEqual([ownClassifier, unauthorizedStatus])
    expect(resolved.errorMappers).toEqual([ownMapper, vuestrataErrorMapper])
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'ignores a timeout of %s, which would leave requests without a deadline',
    (timeoutMs) => {
      expect(resolveApiIntegration({ timeoutMs }).timeoutMs).toBe(15_000)
    },
  )

  it('names no collection dialect unless the project or its preset does', () => {
    expect(DEFAULT_API_INTEGRATION.collection).toBeUndefined()
    expect('collection' in resolveApiIntegration({})).toBe(false)
    expect('collection' in resolveApiIntegration({ backend: presets.vuestrata })).toBe(false)
    expect('collection' in resolveApiIntegration({ backend: presets.aspnet })).toBe(false)
    expect('collection' in resolveApiIntegration({ backend: presets.nest })).toBe(false)
  })

  it('resolves the collection dialect of the project, which replaces that of the preset', () => {
    expect(resolveApiIntegration({ collection: dialects.spring }).collection).toMatchObject({
      name: 'spring',
      spec: dialects.spring,
      updateMethod: 'PATCH',
    })

    const camel = extendDialect(dialects.laravel, { keys: 'camel' })
    const resolved = resolveApiIntegration({ backend: presets.laravel, collection: camel })

    expect(resolved.collection?.spec).toBe(camel)
    expect(resolved.collection?.keys).toEqual({ wire: 'snake' })
    // Everything else of the preset still applies.
    expect(resolved.csrf).toBe(csrfPresets.laravel)
  })

  it('refuses a collection value that is not a dialect, naming what it expected', () => {
    // What the key held while it was reserved: an options bag, not a dialect.
    const bag = { pageParam: 'page' } as unknown as CollectionDialect

    expect(() => resolveApiIntegration({ collection: bag })).toThrow(/Not a collection dialect/)
  })
})

describe('the shipped presets', () => {
  it('names one per supported backend', () => {
    expect(Object.keys(presets)).toEqual([
      'vuestrata',
      'laravel',
      'django',
      'spring',
      'aspnet',
      'nest',
    ])
    for (const [key, preset] of Object.entries(presets)) expect(preset.name).toBe(key)
  })

  it('vuestrata adds nothing to the defaults', () => {
    expect(resolveApiIntegration({ backend: presets.vuestrata })).toEqual(DEFAULT_API_INTEGRATION)
  })

  it('laravel: 419 is a CSRF refusal, Laravel errors, the XSRF-TOKEN cookie', () => {
    const resolved = resolveApiIntegration({ backend: presets.laravel })

    expect(resolved.errorMappers).toEqual([laravelErrorMapper, vuestrataErrorMapper])
    expect(resolved.csrf).toBe(csrfPresets.laravel)
    const verdictOf = (context: ApiResponseContext) =>
      resolved.classifiers.map((classifier) => classifier(context)).find(Boolean) ?? null
    expect(verdictOf(response({ status: 419, ok: false }))).toBe('csrf')
    expect(verdictOf(response({ status: 401, ok: false }))).toBe('unauthenticated')
    expect(verdictOf(response({ redirected: true, responseUrl: 'http://localhost/login' }))).toBe(
      'unauthenticated',
    )
    expect(verdictOf(response({ status: 403, ok: false }))).toBeNull()
    expect(resolved.collection?.spec).toBe(dialects.laravel)
  })

  it('django: DRF errors, the csrftoken cookie, and both meanings of a 403', () => {
    const resolved = resolveApiIntegration({ backend: presets.django })

    expect(resolved.errorMappers).toEqual([drfErrorMapper, vuestrataErrorMapper])
    expect(resolved.csrf).toBe(csrfPresets.django)
    const verdictOf = (context: ApiResponseContext) =>
      resolved.classifiers.map((classifier) => classifier(context)).find(Boolean) ?? null
    const forbidden = (detail: string) => response({ status: 403, ok: false, body: { detail } })
    expect(verdictOf(forbidden('CSRF Failed: CSRF token missing.'))).toBe('csrf')
    expect(verdictOf(forbidden('Authentication credentials were not provided.'))).toBe(
      'unauthenticated',
    )
    // A signed-in user who may not do this stays signed in.
    expect(verdictOf(forbidden('You do not have permission to perform this action.'))).toBeNull()
    expect(resolved.collection?.spec).toBe(dialects.drf)
  })

  it('spring: problem details before the Boot default, the XSRF-TOKEN cookie', () => {
    const resolved = resolveApiIntegration({ backend: presets.spring })

    expect(resolved.errorMappers).toEqual([
      problemJsonErrorMapper,
      springBootErrorMapper,
      vuestrataErrorMapper,
    ])
    expect(resolved.csrf).toBe(csrfPresets.spring)
    expect(resolved.collection?.spec).toBe(dialects.spring)
  })

  it('aspnet: problem details, and no CSRF convention of its own', () => {
    const resolved = resolveApiIntegration({ backend: presets.aspnet })

    expect(resolved.errorMappers).toEqual([problemJsonErrorMapper, vuestrataErrorMapper])
    expect(resolved.csrf).toBe(DEFAULT_CSRF_STRATEGY)
    expect(
      resolved.classifiers
        .map((classifier) =>
          classifier(
            response({
              redirected: true,
              responseUrl: 'http://localhost/Account/Login?ReturnUrl=%2Fapi%2Forders',
              contentType: 'text/html',
            }),
          ),
        )
        .find(Boolean),
    ).toBe('unauthenticated')
  })

  it('nest: its error body, and nothing else', () => {
    const resolved = resolveApiIntegration({ backend: presets.nest })

    expect(resolved.errorMappers).toEqual([nestErrorMapper, vuestrataErrorMapper])
    expect(resolved.classifiers).toEqual([unauthorizedStatus])
    expect(resolved.csrf).toBe(DEFAULT_CSRF_STRATEGY)
  })
})

describe('classifiers', () => {
  it('unauthorizedStatus reads a 401, and only a 401', () => {
    expect(unauthorizedStatus(response({ status: 401, ok: false }))).toBe('unauthenticated')
    expect(unauthorizedStatus(response({ status: 403, ok: false }))).toBeNull()
    expect(unauthorizedStatus(response())).toBeNull()
  })

  it('statusMeans gives one status one meaning', () => {
    const expired = statusMeans(440, 'unauthenticated')

    expect(expired(response({ status: 440, ok: false }))).toBe('unauthenticated')
    expect(expired(response({ status: 401, ok: false }))).toBeNull()
  })

  it.each([
    '/login',
    '/Account/Login',
    '/accounts/login/',
    '/signin',
    '/sign-in',
    '/auth/log-in',
    '/login.php',
  ])('recognises %s as a sign-in page', (path) => {
    expect(DEFAULT_LOGIN_PATH.test(path)).toBe(true)
  })

  it.each(['/api/login-history', '/api/orders', '/blogging', '/api/users/designing'])(
    'does not mistake %s for one',
    (path) => {
      expect(DEFAULT_LOGIN_PATH.test(path)).toBe(false)
    },
  )

  describe('loginRedirect', () => {
    const classifier = loginRedirect()

    it('reads a redirect that ended on the sign-in page', () => {
      expect(
        classifier(response({ redirected: true, responseUrl: 'https://app.test/login?next=%2F' })),
      ).toBe('unauthenticated')
    })

    it('reads it for any method: the request was refused before it did anything', () => {
      for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
        expect(
          classifier(response({ method, redirected: true, responseUrl: 'https://app.test/login' })),
        ).toBe('unauthenticated')
      }
    })

    it('reads a redirect that ended on any other HTML page as unexpected, never as signed out', () => {
      const html = response({
        redirected: true,
        responseUrl: 'https://app.test/welcome',
        contentType: 'text/html',
      })

      // A POST the backend applied and answered with a redirect to a page, or
      // a GET a static host's fallback answered: neither is an expired
      // session, and "unauthenticated" would replay the one and end the other.
      for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']) {
        expect(classifier({ ...html, method })).toBe('unexpected')
      }
      expect(classifier({ ...html, expectsJson: false })).toBeNull()
      expect(loginRedirect({ html: false })(html)).toBeNull()
    })

    it('leaves a response that was not redirected alone, whatever it holds', () => {
      // A static host answering /api with its index.html is misrouted, not signed out.
      expect(
        classifier(response({ responseUrl: 'https://app.test/login', contentType: 'text/html' })),
      ).toBeNull()
    })

    it('leaves an ordinary redirect to another JSON resource alone', () => {
      expect(
        classifier(response({ redirected: true, responseUrl: 'https://app.test/api/v2/orders' })),
      ).toBeNull()
    })

    it('takes a pattern for a sign-in page it does not know', () => {
      const custom = loginRedirect({ loginPath: /^\/sso\/start/ })

      expect(
        custom(response({ redirected: true, responseUrl: 'https://app.test/sso/start?rd=1' })),
      ).toBe('unauthenticated')
      expect(
        custom(response({ redirected: true, responseUrl: 'https://app.test/login' })),
      ).toBeNull()
    })
  })

  describe('anonymousForbidden', () => {
    const forbidden = (body: unknown) => response({ status: 403, ok: false, body })

    it("reads DRF's answer to an anonymous request", () => {
      const classifier = anonymousForbidden()

      expect(
        classifier(forbidden({ detail: 'Authentication credentials were not provided.' })),
      ).toBe('unauthenticated')
      expect(
        classifier(forbidden({ detail: 'You do not have permission to perform this action.' })),
      ).toBeNull()
    })

    it('reads a code, in either shape a DRF exception handler writes', () => {
      const classifier = anonymousForbidden()

      expect(classifier(forbidden({ detail: 'Non authentifié.', code: 'not_authenticated' }))).toBe(
        'unauthenticated',
      )
      expect(
        classifier(
          forbidden({
            type: 'client_error',
            errors: [{ code: 'not_authenticated', detail: 'Non authentifié.', attr: null }],
          }),
        ),
      ).toBe('unauthenticated')
      expect(classifier(forbidden({ detail: 'Interdit.', code: 'permission_denied' }))).toBeNull()
    })

    it("reads DRF's own French and Arabic wording, which Accept-Language now asks for", () => {
      const classifier = anonymousForbidden()

      // Verbatim from rest_framework/locale/{fr,ar}/LC_MESSAGES/django.po.
      expect(
        classifier(forbidden({ detail: "Informations d'authentification non fournies." })),
      ).toBe('unauthenticated')
      expect(classifier(forbidden({ detail: 'لم يتم تزويد بيانات الدخول.' }))).toBe(
        'unauthenticated',
      )
      // The permission error stays one, in those languages too.
      expect(
        classifier(
          forbidden({ detail: "Vous n'avez pas la permission d'effectuer cette action." }),
        ),
      ).toBeNull()
      expect(DRF_ANONYMOUS_MESSAGES).toHaveLength(3)
    })

    it('takes the wording of a backend that answers in another language', () => {
      const classifier = anonymousForbidden({
        messages: [...DRF_ANONYMOUS_MESSAGES, /^Anmeldedaten fehlen/],
      })

      expect(classifier(forbidden({ detail: 'Anmeldedaten fehlen.' }))).toBe('unauthenticated')
      expect(
        classifier(forbidden({ detail: 'Authentication credentials were not provided.' })),
      ).toBe('unauthenticated')
      // Without it, a language nobody listed reads as a missing permission:
      // the backend has to send a code, or a 401.
      expect(anonymousForbidden()(forbidden({ detail: 'Anmeldedaten fehlen.' }))).toBeNull()
    })

    it('does not read a WWW-Authenticate header on a 403 as "not signed in"', () => {
      // An OAuth resource server sends one with a 403 that means the opposite.
      const insufficientScope = response({
        status: 403,
        ok: false,
        headers: new Headers({ 'WWW-Authenticate': 'Bearer error="insufficient_scope"' }),
        body: { detail: 'Insufficient scope.' },
      })

      expect(anonymousForbidden()(insufficientScope)).toBeNull()
    })

    it('only ever reads a 403 with a JSON body', () => {
      const classifier = anonymousForbidden()
      const detail = 'Authentication credentials were not provided.'

      expect(classifier(response({ status: 401, ok: false, body: { detail } }))).toBeNull()
      expect(classifier(forbidden('<html>Forbidden</html>'))).toBeNull()
    })
  })

  it('drfCsrfFailed reads the literal prefix DRF writes in every language', () => {
    const forbidden = (detail: string) => response({ status: 403, ok: false, body: { detail } })

    expect(drfCsrfFailed(forbidden('CSRF Failed: CSRF token missing.'))).toBe('csrf')
    expect(drfCsrfFailed(forbidden('CSRF Failed: Origin checking failed.'))).toBe('csrf')
    expect(
      drfCsrfFailed(forbidden('You do not have permission to perform this action.')),
    ).toBeNull()
  })
})

describe('tracing', () => {
  it('is off unless asked for', () => {
    expect(resolveTracing(undefined)).toBe(DEFAULT_TRACING)
    expect(resolveTracing(false)).toBe(DEFAULT_TRACING)
    expect(DEFAULT_TRACING).toEqual({
      requestId: false,
      requestIdHeader: 'X-Request-Id',
      traceparent: false,
      sampled: true,
    })
  })

  it('turns both headers on for `true`, and one for a choice', () => {
    expect(resolveTracing(true)).toEqual({
      requestId: true,
      requestIdHeader: 'X-Request-Id',
      traceparent: true,
      sampled: true,
    })
    expect(resolveTracing({ requestId: true, requestIdHeader: 'X-Correlation-Id' })).toEqual({
      requestId: true,
      requestIdHeader: 'X-Correlation-Id',
      traceparent: false,
      sampled: true,
    })
    expect(resolveTracing({ traceparent: true, sampled: false }).sampled).toBe(false)
  })

  it('makes request ids that are v4 UUIDs, and different each time', () => {
    const ids = Array.from({ length: 50 }, () => createRequestId())

    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    }
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('makes a W3C traceparent: version, trace id, parent id, sampled', () => {
    const first = createTraceparent()

    expect(first).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/)
    expect(createTraceparent()).not.toBe(first)
  })

  it('leaves the sampling decision to the backend when asked to', () => {
    expect(createTraceparent(false)).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-00$/)
  })

  it('still makes ids where there is no Web Crypto', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true })
    try {
      expect(createRequestId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab]/)
      expect(createTraceparent()).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/)
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor)
    }
  })
})
