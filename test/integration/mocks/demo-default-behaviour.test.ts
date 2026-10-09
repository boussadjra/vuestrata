import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { createMemoryHistory, createRouter } from 'vue-router'

import { startDemoMocks } from '@/bootstrap/mocks'
import { createCollectionMock } from '@/mocks/collection'
import { handlers as staticHandlers } from '@/mocks/handlers'
import { createMockJwt, isValidToken, mockApiUrl } from '@/mocks/utils'
import { useModuleStore } from '@/modules'
import LoginPage from '@/modules/auth/pages/login.vue'
import { DEMO_ACCOUNT } from '@/state/demo/account'
import { useMockWorker } from '@/state/mock-worker'
import { ENV_KEYS, parseRuntimeEnv, resolveRuntimeEnv } from '~/lib/config/env.schema'

/**
 * What a project that never sets `VUESTRATA_MOCK_ONLY` gets, written down
 * BEFORE that variable existed.
 *
 * Mocking only some modules beside a real backend is opt-in. A build that does
 * not opt in is one of the two targets it always was: the self-contained demo,
 * where MSW answers every request and the mock adapter signs the demo account
 * in, or production, where neither exists. Everything asserted here is that
 * default, and none of it may change: the environment rules and their wording
 * in the browser, the handlers the demo's worker starts with and the order they
 * come in, the options the worker is started with, what a mocked endpoint
 * accepts as a token, the URLs it claims, and the credential hint on the demo's
 * login page.
 *
 * The assertions in this file are not to be edited to make a change pass. The
 * production side of the same promise cannot be seen from a test: it is the
 * file list and sizes of a production `dist/`, compared before and after.
 */

const worker = vi.hoisted(() => ({
  start: vi.fn(async (_options?: unknown) => undefined),
  stop: vi.fn(),
}))
const setupWorker = vi.hoisted(() => vi.fn((..._handlers: unknown[]) => worker))

vi.mock('msw/browser', () => ({ setupWorker }))
vi.mock('@/modules', () => ({ useModuleStore: vi.fn() }))

const authRefs = vi.hoisted(() => ({
  providers: { __v_isRef: true, value: [] },
  mfaRequired: { __v_isRef: true, value: false },
  isLoading: { __v_isRef: true, value: false },
  error: { __v_isRef: true, value: null },
  capabilities: {
    __v_isRef: true,
    value: {
      register: true,
      social: true,
      magicLink: true,
      mfa: true,
      refresh: true,
      codeExchange: true,
    },
  },
}))

vi.mock('~/modules/auth', () => ({
  useAuth: () => ({
    login: vi.fn(),
    socialLogin: vi.fn(),
    sendMagicLink: vi.fn(),
    verifyMfaCode: vi.fn(),
    ...authRefs,
  }),
}))

afterEach(() => {
  useMockWorker().reset()
  setupWorker.mockClear()
  worker.start.mockClear()
})

// ─── The environment ─────────────────────────────────────────────────────────

const DEMO = { [ENV_KEYS.runtimeMode]: 'demo' }
const PRODUCTION = { [ENV_KEYS.runtimeMode]: 'production', [ENV_KEYS.apiUrl]: '/api' }

describe('the environment, with no VUESTRATA_MOCK_ONLY', () => {
  it('resolves a demo build as it always did', () => {
    for (const resolve of [parseRuntimeEnv, resolveRuntimeEnv]) {
      expect(resolve(DEMO)).toMatchObject({
        runtimeMode: 'demo',
        title: 'Vuestrata',
        apiUrl: '/api',
        useMocks: true,
        authAdapter: 'mock',
        sessionPersistence: 'none',
        iconProvider: 'solar',
        theme: 'default',
        demoAuth: { retentionHours: 24 },
        errorReporting: { dsn: undefined, release: undefined },
      })
    }
  })

  it('resolves a production build as it always did', () => {
    for (const resolve of [parseRuntimeEnv, resolveRuntimeEnv]) {
      expect(resolve(PRODUCTION)).toMatchObject({
        runtimeMode: 'production',
        title: 'Vuestrata',
        apiUrl: '/api',
        useMocks: false,
        authAdapter: 'jwt',
        sessionPersistence: 'refresh-cookie',
        iconProvider: 'solar',
        theme: 'default',
        demoAuth: { retentionHours: 24 },
        errorReporting: { dsn: undefined, release: undefined },
      })
    }
  })

  it('keeps the defaults of a bare environment: demo while developing, production in a build', () => {
    expect(resolveRuntimeEnv({}, { isDev: true })).toMatchObject({
      runtimeMode: 'demo',
      useMocks: true,
      authAdapter: 'mock',
      sessionPersistence: 'none',
    })
    expect(resolveRuntimeEnv({}, { isDev: false })).toMatchObject({
      runtimeMode: 'production',
      useMocks: false,
      authAdapter: 'jwt',
      sessionPersistence: 'refresh-cookie',
    })
  })

  /**
   * Each rule: the configuration that breaks it, the sentence that says so, and
   * what the browser corrects it to. The build must refuse with that sentence;
   * the browser must warn with exactly that sentence and no other.
   */
  const RULES = [
    {
      name: 'a demo with mocks off',
      raw: { ...DEMO, [ENV_KEYS.useMocks]: 'false' },
      message:
        'VUESTRATA_USE_MOCKS must be "true" when VUESTRATA_RUNTIME_MODE="demo" — the demo has no backend to talk to.',
      corrected: { runtimeMode: 'demo', useMocks: true, authAdapter: 'mock' },
    },
    {
      name: 'a demo with a real adapter',
      raw: { ...DEMO, [ENV_KEYS.authAdapter]: 'jwt' },
      message:
        'VUESTRATA_AUTH_ADAPTER must be "mock" when VUESTRATA_RUNTIME_MODE="demo" (received "jwt").',
      corrected: { runtimeMode: 'demo', useMocks: true, authAdapter: 'mock' },
    },
    {
      name: 'a demo that persists a session',
      raw: { ...DEMO, [ENV_KEYS.sessionPersistence]: 'session' },
      message:
        'VUESTRATA_SESSION_PERSISTENCE must be "none" when VUESTRATA_RUNTIME_MODE="demo" ' +
        '(received "session"). The demo restores its session from IndexedDB; ' +
        'there is no refresh token and no refresh endpoint outside MSW.',
      corrected: { runtimeMode: 'demo', sessionPersistence: 'none' },
    },
    {
      name: 'production with mocks on',
      raw: { ...PRODUCTION, [ENV_KEYS.useMocks]: 'true' },
      message:
        'VUESTRATA_USE_MOCKS must be "false" when VUESTRATA_RUNTIME_MODE="production" — MSW is not bundled in a production build.',
      corrected: { runtimeMode: 'production', useMocks: false },
    },
    {
      name: 'production with the mock adapter',
      raw: { ...PRODUCTION, [ENV_KEYS.authAdapter]: 'mock' },
      message:
        'VUESTRATA_AUTH_ADAPTER="mock" is not valid in production: the mock adapter\'s endpoints only exist inside MSW. ' +
        'Use "jwt", "oauth" or "session", or set VUESTRATA_RUNTIME_MODE="demo".',
      corrected: { runtimeMode: 'production', authAdapter: 'jwt' },
    },
    {
      name: 'a cookie-transport adapter with a bearer persistence',
      raw: {
        ...PRODUCTION,
        [ENV_KEYS.authAdapter]: 'oauth',
        [ENV_KEYS.sessionPersistence]: 'local',
      },
      message:
        'VUESTRATA_SESSION_PERSISTENCE="local" has no meaning with ' +
        'VUESTRATA_AUTH_ADAPTER="oauth": that adapter uses cookie transport and resumes from ' +
        'its session cookie. Set it to "none".',
      corrected: { runtimeMode: 'production', authAdapter: 'oauth', sessionPersistence: 'none' },
    },
    {
      name: 'production pointed at a placeholder host',
      raw: { ...PRODUCTION, [ENV_KEYS.apiUrl]: 'https://api.example.com/v1' },
      message:
        'VUESTRATA_API_URL is not usable in production: "https://api.example.com/v1" points at the placeholder host "api.example.com".',
      corrected: { runtimeMode: 'production', apiUrl: '/api' },
    },
  ]

  it.each(RULES)('refuses $name in a build, in the same words', ({ raw, message }) => {
    expect(() => parseRuntimeEnv(raw)).toThrow(message)
  })

  it.each(RULES)(
    'corrects $name in the browser, with that one warning',
    ({ raw, message, corrected }) => {
      const onWarn = vi.fn()

      expect(resolveRuntimeEnv(raw, { onWarn })).toMatchObject(corrected)
      expect(onWarn.mock.calls).toEqual([[`${message} Auto-correcting.`]])
    },
  )
})

// ─── The demo's mock backend ─────────────────────────────────────────────────

/**
 * A module store that has `collectMockHandlers()` and nothing else. The demo
 * asks it for every module's handlers; reaching for anything more would be a
 * change to how an ordinary demo starts.
 */
function demoModuleStore(handlers: unknown[]) {
  const collectMockHandlers = vi.fn(async () => handlers)
  const store = new Proxy(
    { collectMockHandlers },
    {
      get(target, key) {
        if (key in target) return target[key as keyof typeof target]
        throw new Error(`An ordinary demo read \`${String(key)}\` from the module store.`)
      },
    },
  )
  vi.mocked(useModuleStore).mockReturnValue(store as never)
  return collectMockHandlers
}

/** `GET <path>` for each handler, in order: what an MSW handler says it answers. */
const headers = (handlers: readonly unknown[]) =>
  handlers.map((handler) => (handler as { info: { header: string } }).info.header)

describe('the mock backend of an ordinary demo', () => {
  it('answers the same static endpoints, in the same order', () => {
    expect(headers(staticHandlers)).toEqual([
      'GET */api/dashboard/stats',
      'GET */api/dashboard/activity',
      'GET */api/dashboard/revenue-breakdown',
      'GET */api/dashboard/funnel',
      'GET */api/dashboard/team-performance',
      'GET */api/dashboard/recent-activity',
      'GET */api/dashboard/attention',
      'GET */api/dashboard/upcoming',
      'GET */api/dashboard/health',
      'GET */api/users',
      'PATCH */api/users/:id/role',
      'POST */api/users',
      'PATCH */api/users/:id/permissions',
      'GET */api/billing',
      'POST */api/billing/subscribe',
      'POST */api/billing/cancel',
      'PUT */api/billing/payment-methods',
      'GET */api/audit-logs',
    ])
  })

  it('starts one worker with every static handler, then every handler the modules contributed', async () => {
    const moduleHandlers = [{ id: 'auth-login' }, { id: 'orders-list' }]
    const collectMockHandlers = demoModuleStore(moduleHandlers)

    await startDemoMocks()

    expect(collectMockHandlers).toHaveBeenCalledOnce()
    expect(setupWorker).toHaveBeenCalledOnce()
    expect(setupWorker.mock.calls[0]).toEqual([...staticHandlers, ...moduleHandlers])
  })

  it('starts that worker with the options it always had', async () => {
    demoModuleStore([])

    await startDemoMocks()

    expect(worker.start.mock.calls).toEqual([
      [
        {
          onUnhandledRequest: 'bypass',
          serviceWorker: { url: '/mockServiceWorker.js' },
          // Vitest runs as a dev server: the startup banner is on.
          quiet: false,
        },
      ],
    ])
  })

  it('claims an endpoint under the API base path, on any origin', () => {
    expect(mockApiUrl('/orders')).toBe('*/api/orders')
    expect(mockApiUrl('/orders/:id')).toBe('*/api/orders/:id')
  })

  it("accepts the mock adapter's tokens and no other", () => {
    const request = (authorization?: string) =>
      new Request('http://localhost/api/orders', {
        headers: authorization ? { Authorization: authorization } : {},
      })

    expect(isValidToken(request(`Bearer ${createMockJwt({ sub: '1' })}`))).toBe(true)
    expect(isValidToken(request('Bearer mock-jwt-token-legacy'))).toBe(true)

    // A real backend's token: three segments, and not issued by the mock.
    const real = [
      btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
      btoa(JSON.stringify({ iss: 'https://id.acme.test', sub: '42' })),
      'signature',
    ].join('.')
    expect(isValidToken(request(`Bearer ${real}`))).toBe(false)
    expect(isValidToken(request('Bearer opaque-session-token'))).toBe(false)
    expect(isValidToken(request('Basic ZGVtbzpkZW1v'))).toBe(false)
    // Cookie transport sends no Authorization header at all.
    expect(isValidToken(request())).toBe(false)
  })

  it('answers 401 from a mocked collection for a request without such a token', async () => {
    const orders = createCollectionMock({
      resource: 'orders',
      seed: [{ id: 'o-1' }],
      searchFields: [],
      latency: 0,
    })
    const list = orders.handlers[0] as unknown as {
      resolver: (input: { request: Request }) => Promise<Response>
    }

    const response = await list.resolver({
      request: new Request('http://localhost/api/orders', {
        headers: { Authorization: 'Bearer a-real-backend-token' },
      }),
    })

    expect(response.status).toBe(401)
  })
})

// ─── The demo's login page ───────────────────────────────────────────────────

describe('the login page of an ordinary demo', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('shows the demo account under the form', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/auth/login', component: LoginPage },
        { path: '/auth/register', component: { template: '<div />' } },
      ],
    })
    await router.push('/auth/login')
    await router.isReady()

    const wrapper = mount(LoginPage, {
      global: { plugins: [createPinia(), router], stubs: { Logo: true } },
    })

    expect(wrapper.text()).toContain('Demo credentials')
    expect(wrapper.text()).toContain(`${DEMO_ACCOUNT.email} / ${DEMO_ACCOUNT.password}`)
  })
})
