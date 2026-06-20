import { describe, it, expect, vi } from 'vite-plus/test'

import { authAdapter, AUTH_ADAPTER_ENV_KEY } from '@/config/app.config'
import { createAuthAdapter, resolveAuthAdapterName } from '@/modules/auth'

describe('auth env contract', () => {
  it('should use VUESTRATA_AUTH_ADAPTER as the canonical env key', () => {
    expect(AUTH_ADAPTER_ENV_KEY).toBe('VUESTRATA_AUTH_ADAPTER')
  })

  it('should fall back to mock by default', () => {
    expect(resolveAuthAdapterName(undefined)).toBe('mock')
    expect(authAdapter).toBeTruthy()
  })

  it('should warn and fall back to mock for unknown adapter values', async () => {
    vi.resetModules()
    const warnMock = vi.fn()
    vi.doMock('~/lib/logger', () => ({
      logger: { withTag: () => ({ warn: warnMock }) },
      createScopedLogger: () => ({ warn: warnMock }),
    }))
    const { resolveAuthAdapterName: resolve } = await import('@/modules/auth')
    expect(resolve('custom')).toBe('mock')
    expect(warnMock).toHaveBeenCalledTimes(1)
  })
})

describe('mock auth adapter contract', () => {
  it('should expose the full adapter surface', () => {
    const adapter = createAuthAdapter('mock')
    expect(typeof adapter.login).toBe('function')
    expect(typeof adapter.register).toBe('function')
    expect(typeof adapter.logout).toBe('function')
    expect(typeof adapter.getUser).toBe('function')
    expect(typeof adapter.refreshToken).toBe('function')
    expect(typeof adapter.socialLogin).toBe('function')
    expect(typeof adapter.sendMagicLink).toBe('function')
    expect(typeof adapter.verifyMagicLink).toBe('function')
  })

  it('should use the mock adapter for credentials login, magic link request, and logout-capable flows', async () => {
    vi.resetModules()
    vi.doMock('~/lib/api/client', () => ({
      apiFetch: vi.fn(async (url: string, options?: { body?: { email?: string } }) => {
        if (url === '/auth/login') {
          return {
            user: {
              id: '1',
              email: options?.body?.email,
              name: 'Demo Admin',
              role: 'admin',
            },
            token: 'mock-token',
            refreshToken: 'mock-refresh-token',
            expiresIn: 3600,
          }
        }

        if (url === '/auth/magic-link') {
          return { message: `Magic link sent to ${options?.body?.email}` }
        }

        if (url === '/auth/logout') {
          return { message: 'Logged out' }
        }

        throw new Error(`Unexpected url: ${url}`)
      }),
    }))

    const { createAuthAdapter: createMockedAuthAdapter } = await import('@/modules/auth')
    const mockedAdapter = createMockedAuthAdapter('mock')
    const loginResult = await mockedAdapter.login({
      email: 'demo@vuestrata.dev',
      password: 'password',
    })
    expect(loginResult.user.email).toBe('demo@vuestrata.dev')
    expect(loginResult.refreshToken).toBe('mock-refresh-token')

    const magicResult = await mockedAdapter.sendMagicLink({
      email: 'demo@vuestrata.dev',
    })
    expect(magicResult.message).toContain('demo@vuestrata.dev')

    await expect(mockedAdapter.logout()).resolves.toBeUndefined()
  })
})
