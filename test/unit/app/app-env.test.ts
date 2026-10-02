import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { RUNTIME_CONFIG_GLOBAL } from '~/lib/config/runtime-overlay'

/**
 * `~/bootstrap/app-env` is where the project's `deploy.config.ts` reaches the
 * browser: its `env` schemas are applied to what the build inlined, overlaid
 * by what the deployment set for the keys under `runtime`.
 *
 * The seeded file declares nothing in the template, so it is replaced here by
 * one that does. What is asserted is the wiring, not the file's contents.
 */
vi.mock('~/config/deploy.config', async () => {
  const { z } = await import('zod')
  return {
    default: {
      env: {
        VUESTRATA_FEATURE_BILLING: z.enum(['on', 'off']).default('off'),
        VUESTRATA_SUPABASE_URL: z.url().optional(),
      },
      runtime: ['VUESTRATA_SUPABASE_URL'],
    },
  }
})

const warn = vi.fn()
vi.mock('~/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/logger')>()),
  createScopedLogger: () => ({ warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

async function loadAppEnv(overlay?: unknown) {
  vi.resetModules()
  if (overlay !== undefined) Object.assign(globalThis, { [RUNTIME_CONFIG_GLOBAL]: overlay })
  return (await import('~/bootstrap/app-env')).appEnv as Record<string, unknown>
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, RUNTIME_CONFIG_GLOBAL)
  vi.unstubAllEnvs()
  warn.mockClear()
})

describe('appEnv', () => {
  it('holds the declared variables, with their defaults', async () => {
    expect(await loadAppEnv()).toEqual({
      VUESTRATA_FEATURE_BILLING: 'off',
      VUESTRATA_SUPABASE_URL: undefined,
    })
    expect(warn).not.toHaveBeenCalled()
  })

  it('reads what the build inlined', async () => {
    vi.stubEnv('VUESTRATA_FEATURE_BILLING', 'on')

    expect(await loadAppEnv()).toMatchObject({ VUESTRATA_FEATURE_BILLING: 'on' })
  })

  it('takes a runtime key from the overlay, over the built value', async () => {
    vi.stubEnv('VUESTRATA_SUPABASE_URL', 'https://built.supabase.co')

    const env = await loadAppEnv({ VUESTRATA_SUPABASE_URL: 'https://staging.supabase.co' })

    expect(env.VUESTRATA_SUPABASE_URL).toBe('https://staging.supabase.co')
    expect(warn).not.toHaveBeenCalled()
  })

  it('does not let the overlay set a variable that is not listed under runtime', async () => {
    const env = await loadAppEnv({ VUESTRATA_FEATURE_BILLING: 'on' })

    expect(env.VUESTRATA_FEATURE_BILLING).toBe('off')
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/VUESTRATA_FEATURE_BILLING.*not a runtime-overridable key/),
    )
  })

  it('reports what the overlay ignored, once per entry', async () => {
    await loadAppEnv({
      VUESTRATA_RUNTIME_MODE: 'demo',
      VUESTRATA_NOT_DECLARED: 'x',
      VUESTRATA_API_URL: '/api',
    })

    // The built-in runtime key is not this module's to report on.
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/VUESTRATA_RUNTIME_MODE.*fixed when/))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('VUESTRATA_NOT_DECLARED'))
  })

  it('falls back with a warning instead of throwing on a bad runtime value', async () => {
    const env = await loadAppEnv({ VUESTRATA_SUPABASE_URL: 'not a url' })

    expect(env.VUESTRATA_SUPABASE_URL).toBeUndefined()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('VUESTRATA_SUPABASE_URL'))
  })
})

describe('the seeded deploy.config.ts', () => {
  it('declares nothing, so the app behaves exactly as it did without it', async () => {
    const { default: shipped } =
      await vi.importActual<typeof import('~/config/deploy.config')>('~/config/deploy.config')

    expect(shipped).toEqual({})
  })
})
