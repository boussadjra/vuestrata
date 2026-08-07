import { describe, expect, it, vi } from 'vite-plus/test'

import {
  ENV_KEYS,
  isDemoRuntime,
  parseRuntimeEnv,
  resolveRuntimeEnv,
} from '~/lib/config/env.schema'

/**
 * The env schema is the boundary that decides which of the two artifacts a
 * build produces. It runs twice with deliberately different failure modes:
 * strict at build time (`parseRuntimeEnv`, throws) and lenient in the browser
 * (`resolveRuntimeEnv`, warns and corrects). Both must agree on what is valid.
 */

const demoEnv = {
  [ENV_KEYS.runtimeMode]: 'demo',
  [ENV_KEYS.useMocks]: 'true',
  [ENV_KEYS.authAdapter]: 'mock',
}

const productionEnv = {
  [ENV_KEYS.runtimeMode]: 'production',
  [ENV_KEYS.useMocks]: 'false',
  [ENV_KEYS.authAdapter]: 'jwt',
  [ENV_KEYS.apiUrl]: 'https://api.acme.test',
}

describe('parseRuntimeEnv (strict, build time)', () => {
  it('accepts a valid demo configuration', () => {
    const env = parseRuntimeEnv(demoEnv)
    expect(env.runtimeMode).toBe('demo')
    expect(env.useMocks).toBe(true)
    expect(env.authAdapter).toBe('mock')
    expect(isDemoRuntime(env)).toBe(true)
  })

  it('accepts a valid production configuration', () => {
    const env = parseRuntimeEnv(productionEnv)
    expect(env.runtimeMode).toBe('production')
    expect(env.useMocks).toBe(false)
    expect(env.authAdapter).toBe('jwt')
    expect(isDemoRuntime(env)).toBe(false)
  })

  it('defaults to demo in dev and production in a build', () => {
    expect(parseRuntimeEnv({}, { isDev: true }).runtimeMode).toBe('demo')
    expect(parseRuntimeEnv({ [ENV_KEYS.apiUrl]: '/api' }, { isDev: false }).runtimeMode).toBe(
      'production',
    )
  })

  it('derives useMocks and authAdapter from the mode so one variable is enough', () => {
    const demo = parseRuntimeEnv({ [ENV_KEYS.runtimeMode]: 'demo' })
    expect(demo.useMocks).toBe(true)
    expect(demo.authAdapter).toBe('mock')
  })

  // The combination rules — none of these were checked before.
  it('rejects the mock adapter in production, because its endpoints only exist in MSW', () => {
    expect(() => parseRuntimeEnv({ ...productionEnv, [ENV_KEYS.authAdapter]: 'mock' })).toThrow(
      /mock.*not valid in production/i,
    )
  })

  it('rejects mocks enabled in production, because MSW is not bundled there', () => {
    expect(() => parseRuntimeEnv({ ...productionEnv, [ENV_KEYS.useMocks]: 'true' })).toThrow(
      /must be "false"/i,
    )
  })

  it('rejects mocks disabled in demo mode, because there is no backend', () => {
    expect(() => parseRuntimeEnv({ ...demoEnv, [ENV_KEYS.useMocks]: 'false' })).toThrow(
      /must be "true"/i,
    )
  })

  it('rejects a non-mock adapter in demo mode', () => {
    expect(() => parseRuntimeEnv({ ...demoEnv, [ENV_KEYS.authAdapter]: 'jwt' })).toThrow(
      /must be "mock"/i,
    )
  })

  it('rejects a placeholder API host in production', () => {
    for (const apiUrl of ['http://localhost:3000/api', 'https://api.example.com']) {
      expect(() => parseRuntimeEnv({ ...productionEnv, [ENV_KEYS.apiUrl]: apiUrl })).toThrow(
        /placeholder host/i,
      )
    }
  })

  it('allows a same-origin path in production — that means "behind a proxy"', () => {
    expect(parseRuntimeEnv({ ...productionEnv, [ENV_KEYS.apiUrl]: '/api' }).apiUrl).toBe('/api')
  })

  it('rejects an API URL that is neither absolute nor a path', () => {
    expect(() => parseRuntimeEnv({ ...productionEnv, [ENV_KEYS.apiUrl]: 'api.acme.test' })).toThrow(
      /neither an absolute URL nor a same-origin path/i,
    )
  })

  it('rejects values outside an allowlist', () => {
    expect(() => parseRuntimeEnv({ [ENV_KEYS.authAdapter]: 'saml' })).toThrow(
      /Invalid environment/i,
    )
    expect(() => parseRuntimeEnv({ [ENV_KEYS.useMocks]: 'yes' })).toThrow(/Invalid environment/i)
  })

  it('reports every field problem at once rather than one per build', () => {
    expect(() =>
      parseRuntimeEnv({ [ENV_KEYS.authAdapter]: 'saml', [ENV_KEYS.iconProvider]: 'fontawesome' }),
    ).toThrow(/VUESTRATA_AUTH_ADAPTER[\s\S]*VUESTRATA_ICON_PROVIDER/)
  })

  it('clamps demo retention to a sane range', () => {
    expect(
      parseRuntimeEnv({ ...demoEnv, [ENV_KEYS.demoRetentionHours]: '48' }).demoAuth.retentionHours,
    ).toBe(48)
    expect(() => parseRuntimeEnv({ ...demoEnv, [ENV_KEYS.demoRetentionHours]: '0' })).toThrow(
      /1–720 hours/,
    )
  })

  it('treats empty strings as unset rather than invalid', () => {
    const env = parseRuntimeEnv({ ...demoEnv, [ENV_KEYS.title]: '' })
    expect(env.title).toBe('Vuestrata')
  })
})

describe('resolveRuntimeEnv (lenient, browser)', () => {
  it('never throws on an invalid combination — it corrects and warns', () => {
    const onWarn = vi.fn()
    const env = resolveRuntimeEnv({ ...productionEnv, [ENV_KEYS.authAdapter]: 'mock' }, { onWarn })

    expect(env.authAdapter).toBe('jwt')
    expect(onWarn).toHaveBeenCalledWith(expect.stringMatching(/not valid in production/i))
  })

  it('falls back to the default for an out-of-allowlist value', () => {
    const onWarn = vi.fn()
    const env = resolveRuntimeEnv(
      { ...demoEnv, [ENV_KEYS.iconProvider]: 'fontawesome' },
      { onWarn },
    )

    expect(env.iconProvider).toBe('solar')
    expect(onWarn).toHaveBeenCalledWith(expect.stringMatching(/VUESTRATA_ICON_PROVIDER/))
  })

  it('recovers when several fields are invalid at once', () => {
    const env = resolveRuntimeEnv({
      [ENV_KEYS.runtimeMode]: 'staging',
      [ENV_KEYS.authAdapter]: 'saml',
      [ENV_KEYS.demoRetentionHours]: 'soon',
    })

    expect(env.runtimeMode).toBe('production')
    expect(env.authAdapter).toBe('jwt')
    expect(env.demoAuth.retentionHours).toBe(24)
  })

  it('agrees with the strict parser on every valid configuration', () => {
    for (const raw of [demoEnv, productionEnv, {}]) {
      expect(resolveRuntimeEnv(raw)).toEqual(parseRuntimeEnv(raw))
    }
  })

  it('ignores non-string values instead of coercing them to "[object Object]"', () => {
    const env = resolveRuntimeEnv({ ...demoEnv, [ENV_KEYS.title]: { nope: true } })
    expect(env.title).toBe('Vuestrata')
  })
})
