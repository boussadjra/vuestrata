import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test'

/**
 * The `session` adapter with the API on ANOTHER origin.
 *
 * Laravel serves its session routes at the root of its origin and the API
 * under `/api`. With `VUESTRATA_API_URL=/api` both are on the page's origin,
 * which `session-adapter.test.ts` covers. Here the API URL is
 * `https://api.example.test/api`, and the point is that `/login`,
 * `/logout` and `/sanctum/csrf-cookie` go to `https://api.example.test`, not to
 * the page and not under `/api`, and that the client still treats them as the
 * API: cookies and the CSRF header are sent.
 *
 * The API URL is read when the client's module is evaluated, so each test
 * takes a fresh module graph with the variable set, the way
 * `test/unit/auth/endpoints.test.ts` takes one with the client stubbed.
 */

const API = 'https://api.example.test'

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())

const laravelUser = { id: 7, name: 'Ada Lovelace', email: 'ada@example.test', role: 'manager' }

type Wiring = typeof import('@/bootstrap/auth-wiring')

let wiring: Wiring
let createAuthAdapter: typeof import('@/modules/auth').createAuthAdapter
let apiFetch: typeof import('@/lib/api/client').apiFetch
let useAuthStore: typeof import('@/stores/auth').useAuthStore

beforeEach(async () => {
  vi.resetModules()
  vi.stubEnv('VUESTRATA_API_URL', `${API}/api`)
  vi.stubGlobal('__VUESTRATA_SESSION_ADAPTER__', true)

  const { createPinia, setActivePinia } = await import('pinia')
  setActivePinia(createPinia())
  const { installRuntimeBackends } = await import('~/state/runtime-backends')
  installRuntimeBackends()

  const auth = await import('@/lib/auth')
  const { resolveApiIntegration } = await import('@/lib/api/integration')
  const { presets } = await import('@/lib/api/presets')
  const { installApiIntegration } = await import('@/lib/runtime')
  auth.installAuthConfig(
    auth.resolveAuthConfig({
      endpoints: auth.endpointPresets.sanctum,
      mapUser: (raw) => {
        const record = raw as typeof laravelUser
        return { id: String(record.id), name: record.name, email: record.email, role: record.role }
      },
    }),
  )
  installApiIntegration(resolveApiIntegration({ backend: presets.laravel }))

  const { runtimeEnv } = await import('~/lib/config')
  runtimeEnv.sessionPersistence = 'none'

  wiring = await import('@/bootstrap/auth-wiring')
  ;({ createAuthAdapter } = await import('@/modules/auth'))
  ;({ apiFetch } = await import('@/lib/api/client'))
  ;({ useAuthStore } = await import('@/stores/auth'))
})

afterEach(() => {
  server.resetHandlers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
})

/** One request as a line, with its full origin. */
function line(request: Request): string {
  const url = new URL(request.url)
  return [
    request.method,
    `${url.origin}${url.pathname}`,
    `credentials=${request.credentials}`,
    `authorization=${request.headers.get('Authorization') ?? '-'}`,
    `xsrf=${request.headers.get('X-XSRF-TOKEN') ?? '-'}`,
  ].join(' ')
}

/** Laravel with Sanctum on the API's origin; nothing answers on the page's. */
function sanctumBackend() {
  const state = { session: false, serial: 0, seen: [] as string[] }
  const issue = () => {
    state.serial++
    // In a browser this cookie is readable because both hosts share a parent
    // domain (`SESSION_DOMAIN=.example.test`).
    document.cookie = `XSRF-TOKEN=${encodeURIComponent(`xsrf-${state.serial}=`)}; path=/`
  }
  const noContent = () => new HttpResponse(null, { status: 204 })

  server.use(
    http.get(`${API}/sanctum/csrf-cookie`, ({ request }) => {
      state.seen.push(line(request))
      issue()
      return noContent()
    }),
    http.post(`${API}/login`, ({ request }) => {
      state.seen.push(line(request))
      state.session = request.credentials === 'include'
      issue()
      return noContent()
    }),
    http.post(`${API}/logout`, ({ request }) => {
      state.seen.push(line(request))
      state.session = false
      return noContent()
    }),
    http.get(`${API}/api/user`, ({ request }) => {
      state.seen.push(line(request))
      return state.session
        ? HttpResponse.json(laravelUser)
        : HttpResponse.json({ message: 'Unauthenticated.' }, { status: 401 })
    }),
    http.post(`${API}/api/things`, ({ request }) => {
      state.seen.push(line(request))
      return HttpResponse.json({ id: 1 }, { status: 201 })
    }),
  )
  return state
}

function wire() {
  const store = useAuthStore()
  const router = { replace: vi.fn(async () => {}), currentRoute: { value: undefined } }
  wiring.setupAuthInterceptor(store, {
    adapterName: 'session',
    createAuthAdapter,
    router: router as unknown as Parameters<Wiring['setupAuthInterceptor']>[1]['router'],
  })
  return { store, adapter: createAuthAdapter('session') }
}

describe('with the Sanctum presets and the API on another origin', () => {
  it('sends the session routes to the root of the API’s origin, with cookies and the token', async () => {
    const backend = sanctumBackend()
    const { store, adapter } = wire()

    const session = await adapter.login({ email: laravelUser.email, password: 'correct' })
    store.setAuth(session.user, session.token, session.refreshToken, session.expiresIn)
    await apiFetch('/things', { method: 'POST', body: { a: 1 } })
    await wiring.restoreSessionForBoot(store, { adapterName: 'session', createAuthAdapter })
    await adapter.logout()

    expect(backend.seen).toEqual([
      `GET ${API}/sanctum/csrf-cookie credentials=include authorization=- xsrf=-`,
      `POST ${API}/login credentials=include authorization=- xsrf=xsrf-1=`,
      `GET ${API}/api/user credentials=include authorization=- xsrf=xsrf-2=`,
      `POST ${API}/api/things credentials=include authorization=- xsrf=xsrf-2=`,
      `GET ${API}/api/user credentials=include authorization=- xsrf=xsrf-2=`,
      `POST ${API}/logout credentials=include authorization=- xsrf=xsrf-2=`,
    ])
    expect(session.user).toMatchObject({ id: '7', email: laravelUser.email })
    expect(store.isAuthenticated).toBe(true)
  })

  it('keeps the session off any other origin: no cookies, no token', async () => {
    sanctumBackend()
    const { store, adapter } = wire()
    const session = await adapter.login({ email: laravelUser.email, password: 'correct' })
    store.setAuth(session.user, session.token, session.refreshToken, session.expiresIn)
    const seen: string[] = []
    server.use(
      http.post('https://hooks.example.test/notify', ({ request }) => {
        seen.push(line(request))
        return HttpResponse.json({ ok: true })
      }),
    )

    await apiFetch('https://hooks.example.test/notify', { method: 'POST', body: { a: 1 } })

    expect(seen).toEqual([
      'POST https://hooks.example.test/notify credentials=omit authorization=- xsrf=-',
    ])
  })
})
