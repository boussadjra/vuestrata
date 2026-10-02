import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import {
  installAuthConfig,
  resolveAuthConfig,
  type AuthAdapter,
  type AuthAdapterFactory,
  type AuthConfig,
} from '@/lib/auth'
import {
  createAuthAdapter,
  loadAuthAdapter,
  registeredAuthAdapters,
  resolveAuthAdapterName,
} from '@/modules/auth/adapters'

/**
 * The adapter registry: the built-in adapters, plus whatever a project
 * registers under `adapters` in `app/config/auth.config.ts`.
 *
 * It used to be a closed `switch` with a `default` that answered any name it
 * did not know with the mock adapter. Registering an adapter meant editing
 * that file, and a mistyped name in production meant a login page talking to
 * endpoints that exist only inside the demo's service worker.
 */

/** Put a configuration in force, as `installSeams()` does with the project's file. */
const configure = (config: AuthConfig = {}) => installAuthConfig(resolveAuthConfig(config))

afterEach(() => {
  // The shipped, empty configuration.
  configure()
  vi.unstubAllGlobals()
})

const NO_CAPABILITIES = {
  register: false,
  social: false,
  magicLink: false,
  mfa: false,
  refresh: false,
  codeExchange: false,
}

/** The least an adapter can be. */
function adapter(overrides: Partial<AuthAdapter> = {}): AuthAdapter {
  return {
    name: 'custom',
    transport: 'bearer',
    capabilities: NO_CAPABILITIES,
    login: vi.fn(),
    logout: vi.fn(),
    getUser: vi.fn(),
    ...overrides,
  }
}

describe('built-in adapters', () => {
  it('are built synchronously, by name', () => {
    expect(createAuthAdapter('jwt').name).toBe('jwt')
    expect(createAuthAdapter('oauth').name).toBe('oauth')
    expect(createAuthAdapter('mock').name).toBe('mock')
  })

  it('are the whole list when the project registered nothing', () => {
    expect(registeredAuthAdapters()).toEqual(['mock', 'jwt', 'oauth'])
  })

  it('need no loading: loadAuthAdapter resolves for each of them', async () => {
    await expect(loadAuthAdapter('jwt')).resolves.toBeUndefined()
    await expect(loadAuthAdapter('oauth')).resolves.toBeUndefined()
    await expect(loadAuthAdapter('mock')).resolves.toBeUndefined()
  })

  it('hand the token getters to the jwt adapter', async () => {
    // A token with no `exp` reads as expired, so the adapter skips the request.
    const built = createAuthAdapter('jwt', { getToken: () => 'not-a-jwt' })

    await expect(built.getUser()).resolves.toBeNull()
  })
})

describe('an unknown name', () => {
  it('is an error that names the variable, the built-ins and where to register one', () => {
    expect(() => createAuthAdapter('saml')).toThrow(
      'Unknown VUESTRATA_AUTH_ADAPTER value "saml". Built in: mock, jwt, oauth. To use your own ' +
        'adapter, register it under `adapters` in src/modules/app/config/auth.config.ts.',
    )
    expect(() => resolveAuthAdapterName('saml')).toThrow(/auth\.config\.ts/)
  })

  it('rejects from loadAuthAdapter too, which is what fails the boot', async () => {
    await expect(loadAuthAdapter('saml')).rejects.toThrow(/Unknown VUESTRATA_AUTH_ADAPTER/)
  })

  it('is never answered with the mock adapter', () => {
    configure({ adapters: { company: () => adapter() } })

    expect(() => createAuthAdapter('compnay')).toThrow(/Unknown/)
  })
})

describe('outside a demo build', () => {
  // `__VUESTRATA_DEMO__` is the literal `false` in a production bundle, which
  // is what lets the bundler drop the mock adapter's module altogether.
  it('has no mock adapter', async () => {
    vi.stubGlobal('__VUESTRATA_DEMO__', false)

    expect(registeredAuthAdapters()).toEqual(['jwt', 'oauth'])
    expect(() => createAuthAdapter('mock')).toThrow(/"mock" needs a demo build/)
    // There is nothing to fetch for a built-in name, so the load step passes
    // it on; building it is what refuses, and that fails the boot all the same.
    await expect(loadAuthAdapter('mock')).resolves.toBeUndefined()
  })

  it('defaults to jwt when no name is configured, as the env schema does', () => {
    vi.stubGlobal('__VUESTRATA_DEMO__', false)

    expect(resolveAuthAdapterName(undefined)).toBe('jwt')
    expect(createAuthAdapter(undefined).name).toBe('jwt')
  })

  it('lists an unknown name against the built-ins that exist there', () => {
    vi.stubGlobal('__VUESTRATA_DEMO__', false)

    expect(() => createAuthAdapter('saml')).toThrow(/Built in: jwt, oauth\./)
  })
})

describe('an adapter the project registered with a factory', () => {
  it('is built synchronously, with the options it was asked for', () => {
    const factory = vi.fn<AuthAdapterFactory>(() => adapter({ name: 'company' }))
    configure({ adapters: { company: factory } })
    const options = { getToken: () => 'access', getRefreshToken: () => 'refresh' }

    const built = createAuthAdapter('company', options)

    expect(built.name).toBe('company')
    expect(factory).toHaveBeenCalledExactlyOnceWith(options)
    expect(registeredAuthAdapters()).toEqual(['mock', 'jwt', 'oauth', 'company'])
  })

  it('needs no loading either', async () => {
    configure({ adapters: { company: () => adapter() } })

    await expect(loadAuthAdapter('company')).resolves.toBeUndefined()
  })

  it('may state its transport', () => {
    configure({
      adapters: { sso: { transport: 'cookie', create: () => adapter({ transport: 'cookie' }) } },
    })

    expect(createAuthAdapter('sso').transport).toBe('cookie')
  })

  it('must use the transport it declared, because the build validated against that', () => {
    // A function is shorthand for a bearer adapter; this one is not.
    configure({ adapters: { sso: () => adapter({ transport: 'cookie' }) } })

    expect(() => createAuthAdapter('sso')).toThrow(
      /registers "sso" as a bearer-transport adapter, but the adapter it builds uses "cookie".*sso: \{ transport: 'cookie'/s,
    )
  })

  it('must return an adapter', () => {
    configure({ adapters: { broken: (() => ({ name: 'broken' })) as never } })

    expect(() => createAuthAdapter('broken')).toThrow(
      /"broken" adapter registered in src\/modules\/app\/config\/auth\.config\.ts did not return an auth adapter/,
    )
  })

  it('must say which transport it uses', () => {
    // Without one the API client would not know whether to send a token.
    configure({ adapters: { vague: () => adapter({ transport: undefined as never }) } })

    expect(() => createAuthAdapter('vague')).toThrow(/did not return an auth adapter/)
  })
})

describe('an adapter the project registered to load on demand', () => {
  /** A registration whose module is fetched only when `load` is called. */
  function lazy(factory: AuthAdapterFactory = () => adapter({ name: 'sdk' })) {
    const load = vi.fn(async () => ({ default: factory }))
    configure({ adapters: { sdk: { transport: 'bearer', load } } })
    return load
  }

  it('is not fetched until something asks for it', () => {
    const load = lazy()

    expect(registeredAuthAdapters()).toContain('sdk')
    expect(load).not.toHaveBeenCalled()
  })

  it('cannot be built before it is loaded, and says what to await', () => {
    lazy()

    expect(() => createAuthAdapter('sdk')).toThrow(
      /"sdk" auth adapter is loaded on demand and has not been loaded yet. Await loadAuthAdapter\("sdk"\)/,
    )
  })

  it('is built synchronously once loadAuthAdapter has resolved', async () => {
    const load = lazy()

    await loadAuthAdapter('sdk')

    expect(createAuthAdapter('sdk').name).toBe('sdk')
    expect(createAuthAdapter('sdk').name).toBe('sdk')
    expect(load).toHaveBeenCalledOnce()
  })

  it('is fetched once, however many callers are waiting', async () => {
    const load = lazy()

    await Promise.all([loadAuthAdapter('sdk'), loadAuthAdapter('sdk'), loadAuthAdapter('sdk')])
    await loadAuthAdapter('sdk')

    expect(load).toHaveBeenCalledOnce()
  })

  it('rejects when its module cannot be fetched, naming the file, and can be retried', async () => {
    const load = vi
      .fn<() => Promise<{ default: AuthAdapterFactory }>>()
      .mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
      .mockResolvedValue({ default: () => adapter({ name: 'sdk' }) })
    configure({ adapters: { sdk: { load } } })

    await expect(loadAuthAdapter('sdk')).rejects.toThrow(
      'Could not load the "sdk" auth adapter registered in src/modules/app/config/auth.config.ts: ' +
        'Failed to fetch dynamically imported module',
    )
    expect(() => createAuthAdapter('sdk')).toThrow(/has not been loaded yet/)

    await expect(loadAuthAdapter('sdk')).resolves.toBeUndefined()
    expect(createAuthAdapter('sdk').name).toBe('sdk')
  })

  it('rejects when the module has no factory as its default export', async () => {
    configure({
      adapters: { sdk: { load: (async () => ({ createAdapter: adapter })) as never } },
    })

    await expect(loadAuthAdapter('sdk')).rejects.toThrow(
      /Could not load the "sdk" auth adapter.*no default export that is a factory function/,
    )
  })

  it('checks the loaded adapter like any other', async () => {
    lazy(() => adapter({ transport: 'cookie' }))
    await loadAuthAdapter('sdk')

    expect(() => createAuthAdapter('sdk')).toThrow(/registers "sdk" as a bearer-transport adapter/)
  })

  it('is forgotten when another configuration is installed', async () => {
    lazy()
    await loadAuthAdapter('sdk')

    // The same name, a different module: what the old configuration loaded
    // must not be handed out for it.
    const load = vi.fn(async () => ({ default: () => adapter({ name: 'another-sdk' }) }))
    configure({ adapters: { sdk: { load } } })

    expect(() => createAuthAdapter('sdk')).toThrow(/has not been loaded yet/)
    await loadAuthAdapter('sdk')
    expect(createAuthAdapter('sdk').name).toBe('another-sdk')
  })
})

describe('what a configuration may not register', () => {
  const install = (adapters: AuthConfig['adapters']) => () => configure({ adapters })

  it.each(['jwt', 'oauth', 'mock'])('refuses the built-in name %s', (name) => {
    expect(install({ [name]: () => adapter() })).toThrow(
      new RegExp(`auth\\.config\\.ts: "${name}" is a built-in adapter and cannot be replaced`),
    )
  })

  it.each(['My-SSO', '2fa', 'company_sso', ''])('refuses the name %j', (name) => {
    expect(install({ [name]: () => adapter() })).toThrow(/is not a usable adapter name/)
  })

  it('refuses a registration that is neither a factory nor exactly one of create and load', () => {
    const factory = () => adapter()
    const load = async () => ({ default: factory })

    expect(install({ one: {} as never })).toThrow(/adapter "one" must be a factory function/)
    expect(install({ two: { create: factory, load } as never })).toThrow(/exactly one of/)
    expect(install({ three: null as never })).toThrow(/adapter "three" must be a factory function/)
  })

  it('refuses a transport that is not one', () => {
    expect(install({ sso: { transport: 'header' as never, create: () => adapter() } })).toThrow(
      /adapter "sso" declares transport "header"/,
    )
  })

  it('leaves the previous configuration in force when it refuses one', () => {
    configure({ adapters: { company: () => adapter({ name: 'company' }) } })

    expect(install({ jwt: () => adapter() })).toThrow()

    expect(createAuthAdapter('company').name).toBe('company')
  })
})

describe("an adapter whose SDK keeps the session (persistence: 'external')", () => {
  const user = { id: 'u1', email: 'a@b.test', name: 'A', role: 'member' } as never
  const session = { user, token: 'access', refreshToken: 'held-by-the-sdk', expiresIn: 900 }

  function external(overrides: Partial<AuthAdapter> = {}) {
    configure({
      adapters: {
        sdk: () =>
          adapter({
            persistence: 'external',
            login: async () => session,
            resumeSession: async () => session,
            refreshSession: async () => ({ token: 'access-2', refreshToken: 'rotated' }),
            ...overrides,
          }),
      },
    })
    return createAuthAdapter('sdk')
  }

  it('never hands the app a refresh token, from any call that answers with a session', async () => {
    const built = external()

    await expect(built.login({ email: 'a@b.test', password: 'pw' })).resolves.toEqual({
      user,
      token: 'access',
      expiresIn: 900,
    })
    await expect(built.resumeSession!()).resolves.toEqual({ user, token: 'access', expiresIn: 900 })
    await expect(built.refreshSession!()).resolves.toEqual({ token: 'access-2' })
  })

  it('passes "nothing to resume" through as it is', async () => {
    const built = external({ resumeSession: async () => null })

    await expect(built.resumeSession!()).resolves.toBeNull()
  })

  it('still runs the adapter’s methods as the adapter', async () => {
    const built = external({
      name: 'sdk',
      async login(this: AuthAdapter) {
        return { ...session, token: `issued-by-${this.name}` }
      },
    })

    await expect(built.login({ email: 'a@b.test', password: 'pw' })).resolves.toMatchObject({
      token: 'issued-by-sdk',
    })
  })

  it('leaves everything else about the adapter as it was', () => {
    const subscribe = vi.fn(() => () => undefined)
    const built = external({ subscribe })

    expect(built.persistence).toBe('external')
    expect(built.transport).toBe('bearer')
    expect(built.subscribe).toBe(subscribe)
    // A method the adapter does not have is not invented.
    expect(built.register).toBeUndefined()
  })

  it('does not touch an adapter that keeps no such promise', async () => {
    configure({ adapters: { own: () => adapter({ login: async () => session }) } })

    await expect(
      createAuthAdapter('own').login({ email: 'a@b.test', password: 'pw' }),
    ).resolves.toEqual(session)
  })
})
