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
import { scannedAuthAdapters } from '~/lib/config'
import { AppError } from '~/lib/errors'

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

/**
 * What the build read from `auth.config.ts`, which is a constant of the
 * bundle. A test that needs the build to have read something says so here.
 */
const scanned = scannedAuthAdapters as Record<string, 'bearer' | 'cookie'>

afterEach(() => {
  // The shipped, empty configuration.
  configure()
  for (const name of Object.keys(scanned)) delete scanned[name]
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

  it('must not be the import itself: a module loaded on demand is registered with load', () => {
    // `sdk: () => import('./sdk-adapter')` type-checks as nothing, and reads
    // like the lazy form. It is a factory that returns a promise.
    configure({
      adapters: { sdk: (() => Promise.resolve({ default: () => adapter() })) as never },
    })

    expect(() => createAuthAdapter('sdk')).toThrow(
      /"sdk" adapter registered in src\/modules\/app\/config\/auth\.config\.ts is a function that returns a promise.*register it as `sdk: \{ load: \(\) => import\(…\) \}`/s,
    )
  })
})

describe('the transport the build read from auth.config.ts', () => {
  // The build validates VUESTRATA_SESSION_PERSISTENCE against the transport
  // it read from the file as text. The registration the app holds is what
  // that text evaluated to, and the two are not the same thing.
  const cookieAdapter = () => adapter({ transport: 'cookie' })

  it('must be the one the adapter uses, even when the registration agrees with the adapter', () => {
    // What the build made of a registration it could not see into.
    scanned.sso = 'bearer'
    configure({ adapters: { sso: { transport: 'cookie', create: cookieAdapter } } })

    expect(() => createAuthAdapter('sso')).toThrow(
      /registers "sso" as a bearer-transport adapter, as the build read it, but the adapter it builds uses "cookie"\. Declare it: `sso: \{ transport: 'cookie'/,
    )
  })

  it('is not in the way when all three agree', () => {
    scanned.sso = 'cookie'
    configure({ adapters: { sso: { transport: 'cookie', create: cookieAdapter } } })

    expect(createAuthAdapter('sso').transport).toBe('cookie')
  })

  it('has nothing to say about a name the build did not read', () => {
    // A test, or a Vite config without the plugin: nothing was validated.
    scanned.other = 'bearer'
    configure({ adapters: { sso: { transport: 'cookie', create: cookieAdapter } } })

    expect(createAuthAdapter('sso').transport).toBe('cookie')
  })

  it('still names the registration when that is what the adapter contradicts', () => {
    scanned.sso = 'bearer'
    configure({ adapters: { sso: cookieAdapter } })

    const refusal = () => createAuthAdapter('sso')
    expect(refusal).toThrow(/registers "sso" as a bearer-transport adapter, but the adapter/)
    expect(refusal).not.toThrow(/as the build read it/)
  })
})

describe('the User contract, for an adapter of the project’s own', () => {
  // The built-in adapters get this from the endpoint calls every response of
  // theirs passes through. A project's adapter talks to an SDK, and used to
  // pass through nothing: a user with no id was stored as it came.
  const user = { id: 'u1', email: 'ada@example.test', name: 'Ada', role: 'member' }
  const credentials = { email: user.email, password: 'pw' }

  function own(overrides: Partial<AuthAdapter>) {
    configure({ adapters: { own: () => adapter(overrides) } })
    return createAuthAdapter('own')
  }
  const answering = (session: unknown) => async () => session as never

  async function contractError(run: () => Promise<unknown>) {
    const error = await run().then(
      () => undefined,
      (reason: unknown) => reason,
    )
    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({ code: 'CONTRACT_MISMATCH', kind: 'contract' })
    return error as AppError
  }

  it.each([
    ['no id', { email: 'x' }, 'id'],
    ['an array for a role', { ...user, role: ['super_admin'] }, 'role'],
    ['permissions that are not an array', { ...user, permissions: 'users:delete' }, 'permissions'],
  ])('refuses a sign-in whose user has %s', async (_case, drifted, field) => {
    const built = own({ login: answering({ user: drifted, token: 'access' }) })

    const error = await contractError(() => built.login(credentials))

    expect(error.details).toHaveProperty(field)
  })

  it.each(['register', 'verifyMagicLink', 'verifyMfa', 'exchangeCode', 'refreshToken'] as const)(
    'holds %s to it as well',
    async (method) => {
      const built = own({ [method]: answering({ user: { email: 'x' }, token: 'access' }) })

      await contractError(() => (built[method] as () => Promise<unknown>)())
    },
  )

  it('hands on the user as the contract shapes it', async () => {
    const built = own({
      login: answering({ user: { id: 7, email: user.email, avatar: null }, token: 'access' }),
    })

    await expect(built.login(credentials)).resolves.toEqual({
      user: { id: '7', email: user.email, name: user.email },
      token: 'access',
    })
  })

  it('refuses a sign-in that names nobody', async () => {
    const built = own({ login: answering({ token: 'access' }) })

    const error = await contractError(() => built.login(credentials))

    expect(error.details).toHaveProperty('user')
  })

  it('lets an MFA challenge through: there is nobody to name yet', async () => {
    const challenge = { mfaRequired: true, mfaToken: 'challenge' }
    const built = own({ login: answering(challenge) })

    await expect(built.login(credentials)).resolves.toEqual(challenge)
  })

  it('resumes nothing, rather than failing the boot, for a user that does not fit', async () => {
    const built = own({ resumeSession: answering({ user: { email: 'x' }, token: 'access' }) })

    await expect(built.resumeSession!()).resolves.toBeNull()
  })

  it('reads a mismatch the adapter raised itself the same way', async () => {
    // The recipe's adapter calls `parseUser` on what its SDK returns.
    const { parseUser } = await import('@/lib/auth')
    const built = own({
      resumeSession: async () => ({ user: parseUser({ email: 'x' }), token: 'access' }),
      getUser: async () => parseUser({ email: 'x' }),
    })

    await expect(built.resumeSession!()).resolves.toBeNull()
    await expect(built.getUser()).resolves.toBeNull()
  })

  it('does not hide a resume that failed for any other reason', async () => {
    const built = own({
      resumeSession: async () => {
        throw new Error('the SDK could not reach its backend')
      },
    })

    await expect(built.resumeSession!()).rejects.toThrow('the SDK could not reach its backend')
  })

  it('leaves a resumed session with no user for the session restore to refuse', async () => {
    const built = own({ resumeSession: answering({ token: 'access' }) })

    await expect(built.resumeSession!()).resolves.toEqual({ token: 'access' })
  })

  it('answers getUser with a valid user, with nobody, and with nobody for one that does not fit', async () => {
    await expect(own({ getUser: async () => user as never }).getUser()).resolves.toEqual(user)
    await expect(own({ getUser: async () => null }).getUser()).resolves.toBeNull()
    await expect(
      own({ getUser: answering({ ...user, role: ['super_admin'] }) }).getUser(),
    ).resolves.toBeNull()
  })

  it('checks the user a refresh chose to include, and asks for none', async () => {
    await expect(
      own({ refreshSession: answering({ token: 'access-2' }) }).refreshSession!(),
    ).resolves.toEqual({ token: 'access-2' })

    const drifted = own({ refreshSession: answering({ token: 'access-2', user: { id: 'u1' } }) })
    await contractError(() => drifted.refreshSession!())
  })

  it('keeps a refresh token an adapter without external persistence returns', async () => {
    const built = own({ login: answering({ user, token: 'access', refreshToken: 'refresh' }) })

    await expect(built.login(credentials)).resolves.toEqual({
      user,
      token: 'access',
      refreshToken: 'refresh',
    })
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
