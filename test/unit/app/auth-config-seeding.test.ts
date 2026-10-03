import { beforeAll, describe, expect, it, vi } from 'vite-plus/test'

/**
 * `app/config/auth.config.ts` reaches the auth module through `installSeams()`,
 * which resolves it and installs it in the `core/lib` runtime slot the adapters
 * read. The seeded file is empty in the template, so it is replaced here by one
 * that configures something of every kind: what is asserted is the wiring, not
 * the file's contents.
 *
 * Everything is imported after the mock, from a fresh module graph, as
 * `rbac-overrides-seeding.test.ts` does.
 */
const { factory } = vi.hoisted(() => ({
  factory: vi.fn(() => ({
    name: 'company',
    transport: 'bearer' as const,
    capabilities: {
      register: false,
      social: false,
      magicLink: false,
      mfa: false,
      refresh: false,
      codeExchange: false,
    },
    login: async () => {
      throw new Error('not called')
    },
    logout: async () => undefined,
    getUser: async () => null,
  })),
}))

vi.mock('~/config/auth.config', () => ({
  default: {
    adapters: { company: factory },
    endpoints: { me: '/users/me', magicLink: null, magicLinkVerify: null },
    providers: [{ id: 'gitlab', label: 'GitLab' }],
  },
}))

let auth: typeof import('@/modules/auth/adapters')
let lib: typeof import('@/lib/auth')
let seams: typeof import('@/bootstrap/seams')

beforeAll(async () => {
  vi.resetModules()
  auth = await import('@/modules/auth/adapters')
  lib = await import('@/lib/auth')
  seams = await import('@/bootstrap/seams')
})

describe('auth.config.ts wiring', () => {
  it('has no effect until the seams are installed: the built-in defaults apply', () => {
    expect(auth.registeredAuthAdapters()).toEqual(['mock', 'jwt', 'oauth'])
    expect(lib.getAuthProviders().map((provider) => provider.id)).toEqual([
      'google',
      'github',
      'microsoft',
    ])
    expect(auth.createAuthAdapter('jwt').capabilities.magicLink).toBe(true)
  })

  it('registers the project’s adapters by name', () => {
    seams.installSeams()

    expect(auth.registeredAuthAdapters()).toEqual(['mock', 'jwt', 'oauth', 'company'])
    expect(auth.createAuthAdapter('company').name).toBe('company')
    expect(factory).toHaveBeenCalledOnce()
  })

  it('puts the project’s endpoints behind the built-in adapters', () => {
    seams.installSeams()

    const adapter = auth.createAuthAdapter('jwt')
    expect(adapter.capabilities.magicLink).toBe(false)
    expect(adapter.sendMagicLink).toBeUndefined()
  })

  it('makes the project’s providers the ones the login page renders and the adapter accepts', async () => {
    seams.installSeams()

    expect(lib.getAuthProviders()).toEqual([{ id: 'gitlab', label: 'GitLab' }])
    // `google` is no longer offered, so it is no longer accepted either: a
    // provider id becomes a path segment of the authorize URL.
    await expect(auth.createAuthAdapter('oauth').socialLogin!('google')).rejects.toThrow(
      /Unsupported OAuth provider: "google"/,
    )
  })
})
