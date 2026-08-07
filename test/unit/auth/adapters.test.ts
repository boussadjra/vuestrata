import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

/**
 * The adapter contract.
 *
 * Before this refactor all three adapters lived in one 606-line file, the JWT
 * adapter was literally `return createBaseAdapter()`, and the interface
 * required eleven methods that adapters could not all honour. These tests
 * assert the two properties that replaced that: each adapter declares a
 * transport, and every advertised capability has a real method behind it.
 */

async function loadAdapters(apiFetch = vi.fn()) {
  vi.doMock('~/lib/api/client', () => ({ apiFetch }))
  const mod = await import('@/modules/auth')
  return { ...mod, apiFetch }
}

beforeEach(() => {
  vi.resetModules()
  sessionStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.doUnmock('~/lib/api/client')
})

describe('adapter selection', () => {
  it('resolves each supported name to a matching adapter', async () => {
    const { createAuthAdapter } = await loadAdapters()

    expect(createAuthAdapter('mock').name).toBe('mock')
    expect(createAuthAdapter('jwt').name).toBe('jwt')
    expect(createAuthAdapter('oauth').name).toBe('oauth')
  })

  it('falls back to mock for an unknown name', async () => {
    const { createAuthAdapter } = await loadAdapters()

    expect(createAuthAdapter('saml').name).toBe('mock')
    expect(createAuthAdapter(undefined).name).toBe('mock')
  })
})

describe('transport declaration', () => {
  // The API client reads this to decide between `Authorization: Bearer` +
  // no cookies, and cookies + CSRF. It used to do BOTH unconditionally.
  it('assigns bearer to token-holding adapters and cookie to the OAuth BFF flow', async () => {
    const { createAuthAdapter } = await loadAdapters()

    expect(createAuthAdapter('mock').transport).toBe('bearer')
    expect(createAuthAdapter('jwt').transport).toBe('bearer')
    expect(createAuthAdapter('oauth').transport).toBe('cookie')
  })
})

describe('capability honesty', () => {
  it.each(['mock', 'jwt', 'oauth'] as const)(
    '%s implements exactly what it advertises',
    async (name) => {
      const { createAuthAdapter } = await loadAdapters()
      const adapter = createAuthAdapter(name)

      const pairs = [
        ['register', adapter.register],
        ['social', adapter.socialLogin],
        ['magicLink', adapter.sendMagicLink],
        ['mfa', adapter.setupMfa],
        ['refresh', adapter.refreshToken],
        ['codeExchange', adapter.exchangeCode],
      ] as const

      for (const [capability, method] of pairs) {
        if (adapter.capabilities[capability]) {
          expect(typeof method, `${name}.${capability} is advertised but missing`).toBe('function')
        } else {
          expect(
            method,
            `${name} implements ${capability} but does not advertise it`,
          ).toBeUndefined()
        }
      }

      // Required on every adapter.
      expect(typeof adapter.login).toBe('function')
      expect(typeof adapter.logout).toBe('function')
      expect(typeof adapter.getUser).toBe('function')
    },
  )

  it('throws a named error when an unsupported capability is invoked', async () => {
    const { createAuthAdapter, requireCapability, UnsupportedAuthCapabilityError } =
      await loadAdapters()
    const oauth = createAuthAdapter('oauth')

    expect(() => requireCapability(oauth, 'magicLink', oauth.sendMagicLink)).toThrow(
      UnsupportedAuthCapabilityError,
    )
    // The message must name both the adapter and the capability — the previous
    // `adapter.sendMagicLink!()` would have thrown "not a function".
    expect(() => requireCapability(oauth, 'magicLink', oauth.sendMagicLink)).toThrow(
      /"oauth".*"magicLink"/,
    )
  })
})

describe('JWT adapter — expiry awareness', () => {
  function makeJwt(expSecondsFromNow: number): string {
    const payload = { exp: Math.floor(Date.now() / 1000) + expSecondsFromNow }
    const encode = (value: object) =>
      btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
    return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.sig`
  }

  it('treats a token with no exp claim as expired', async () => {
    const { isJwtExpired } = await loadAdapters()

    expect(isJwtExpired('not-a-jwt')).toBe(true)
  })

  it('applies a clock-skew margin so a token expiring imminently counts as expired', async () => {
    const { isJwtExpired } = await loadAdapters()

    expect(isJwtExpired(makeJwt(3600))).toBe(false)
    // Inside the 30s margin.
    expect(isJwtExpired(makeJwt(10))).toBe(true)
    expect(isJwtExpired(makeJwt(-1))).toBe(true)
  })

  it('skips the /auth/me request when the held token is already expired', async () => {
    // The whole point of `isJwtExpired`, which previously existed but was never
    // called from any code path despite the docs describing this behaviour.
    const apiFetch = vi.fn()
    const { createAuthAdapter } = await loadAdapters(apiFetch)
    const adapter = createAuthAdapter('jwt', { getToken: () => makeJwt(-60) })

    await expect(adapter.getUser()).resolves.toBeNull()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('still requests /auth/me when the token is valid', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ id: 'u1', email: 'a@b.test' })
    const { createAuthAdapter } = await loadAdapters(apiFetch)
    const adapter = createAuthAdapter('jwt', { getToken: () => makeJwt(3600) })

    await expect(adapter.getUser()).resolves.toMatchObject({ id: 'u1' })
    expect(apiFetch).toHaveBeenCalledWith('/auth/me')
  })
})

describe('endpoint contract', () => {
  it('posts credentials to /auth/login', async () => {
    const apiFetch = vi.fn().mockResolvedValue({})
    const { createAuthAdapter } = await loadAdapters(apiFetch)

    await createAuthAdapter('jwt').login({ email: 'a@b.test', password: 'pw' })

    expect(apiFetch).toHaveBeenCalledWith('/auth/login', {
      method: 'POST',
      body: { email: 'a@b.test', password: 'pw' },
    })
  })

  it('never lets a failing logout endpoint block client-side cleanup', async () => {
    const apiFetch = vi.fn().mockRejectedValue(new Error('backend down'))
    const { createAuthAdapter } = await loadAdapters(apiFetch)

    await expect(createAuthAdapter('jwt').logout()).resolves.toBeUndefined()
  })
})
