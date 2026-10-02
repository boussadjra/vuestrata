import { describe, expect, expectTypeOf, it, vi } from 'vite-plus/test'
import { z } from 'zod'

import type shipped from '~/config/deploy.config'
import {
  type AppEnv,
  defineDeployConfig,
  type DeployConfig,
  describeDeployConfigIssues,
  parseAppEnv,
  resolveAppEnv,
} from '~/lib/config/deploy'
import { ENV_KEYS } from '~/lib/config/env.schema'

/**
 * A project's own environment variables, declared under `env` in
 * `deploy.config.ts`. They are held to the same two standards as the built-in
 * ones: the build refuses an invalid value, and the browser degrades with a
 * warning instead of throwing.
 */

const config = defineDeployConfig({
  env: {
    VUESTRATA_FEATURE_BILLING: z.enum(['on', 'off']).default('off'),
    VUESTRATA_MAPS_KEY: z.string().min(8),
    VUESTRATA_SUPABASE_URL: z.url().optional(),
    VUESTRATA_PAGE_SIZE: z.coerce.number().int().positive().default(25),
  },
  runtime: ['VUESTRATA_SUPABASE_URL', 'VUESTRATA_MAPS_KEY'],
})

const valid = {
  VUESTRATA_FEATURE_BILLING: 'on',
  VUESTRATA_MAPS_KEY: 'pk_live_12345678',
  VUESTRATA_SUPABASE_URL: 'https://abc.supabase.co',
  VUESTRATA_PAGE_SIZE: '50',
}

describe('defineDeployConfig', () => {
  it('returns what it was given', () => {
    const input = { headers: { connectSrc: ['https://login.example.com'] } }

    expect(defineDeployConfig(input)).toBe(input)
  })

  it('types appEnv from the declared schemas', () => {
    type Env = AppEnv<typeof config>

    expectTypeOf<Env['VUESTRATA_FEATURE_BILLING']>().toEqualTypeOf<'on' | 'off'>()
    expectTypeOf<Env['VUESTRATA_MAPS_KEY']>().toEqualTypeOf<string>()
    expectTypeOf<Env['VUESTRATA_SUPABASE_URL']>().toEqualTypeOf<string | undefined>()
    expectTypeOf<Env['VUESTRATA_PAGE_SIZE']>().toEqualTypeOf<number>()
    expectTypeOf(resolveAppEnv(config, valid)).toEqualTypeOf<Env>()
    expectTypeOf(parseAppEnv(config, valid)).toEqualTypeOf<Env>()
  })

  it('does not type a variable nobody declared', () => {
    type Env = AppEnv<typeof config>

    expectTypeOf<Env>().not.toHaveProperty('VUESTRATA_UNDECLARED')
    // The shipped config declares nothing, so appEnv has no members at all.
    const empty = defineDeployConfig({})
    expectTypeOf<keyof AppEnv<typeof empty>>().toEqualTypeOf<never>()
    expectTypeOf<keyof AppEnv<typeof shipped>>().toEqualTypeOf<never>()
  })

  it('only lets a declared variable be listed under runtime', () => {
    defineDeployConfig({
      env: { VUESTRATA_DECLARED: z.string().optional() },
      // @ts-expect-error - VUESTRATA_TYPO is not declared under env.
      runtime: ['VUESTRATA_TYPO'],
    })
  })
})

describe('parseAppEnv (strict, build time)', () => {
  it('returns the parsed values, defaults included', () => {
    expect(parseAppEnv(config, valid)).toEqual({
      VUESTRATA_FEATURE_BILLING: 'on',
      VUESTRATA_MAPS_KEY: 'pk_live_12345678',
      VUESTRATA_SUPABASE_URL: 'https://abc.supabase.co',
      VUESTRATA_PAGE_SIZE: 50,
    })
    expect(parseAppEnv(config, { VUESTRATA_MAPS_KEY: 'pk_live_12345678' })).toMatchObject({
      VUESTRATA_FEATURE_BILLING: 'off',
      VUESTRATA_PAGE_SIZE: 25,
    })
  })

  it('fails on an invalid value, naming every variable at once', () => {
    const raw = { ...valid, VUESTRATA_FEATURE_BILLING: 'maybe', VUESTRATA_PAGE_SIZE: '-3' }

    expect(() => parseAppEnv(config, raw)).toThrow(/Invalid app environment/)
    expect(() => parseAppEnv(config, raw)).toThrow(/VUESTRATA_FEATURE_BILLING/)
    expect(() => parseAppEnv(config, raw)).toThrow(/VUESTRATA_PAGE_SIZE/)
  })

  it('fails when a required build-time variable is missing', () => {
    const buildOnly = defineDeployConfig({ env: { VUESTRATA_MAPS_KEY: z.string().min(8) } })

    expect(() => parseAppEnv(buildOnly, {})).toThrow(/VUESTRATA_MAPS_KEY/)
    expect(() => parseAppEnv(buildOnly, { VUESTRATA_MAPS_KEY: '' })).toThrow(/VUESTRATA_MAPS_KEY/)
  })

  it('lets a runtime variable be absent at build time, but not invalid', () => {
    // The build cannot know what a container will be started with.
    const { VUESTRATA_MAPS_KEY: _, ...withoutKey } = valid

    expect(() => parseAppEnv(config, withoutKey)).not.toThrow()
    expect(() => parseAppEnv(config, { ...valid, VUESTRATA_MAPS_KEY: 'short' })).toThrow(
      /VUESTRATA_MAPS_KEY/,
    )
  })

  it('reads an empty string as unset, like the built-in schema', () => {
    expect(parseAppEnv(config, { ...valid, VUESTRATA_FEATURE_BILLING: '  ' })).toMatchObject({
      VUESTRATA_FEATURE_BILLING: 'off',
    })
  })

  it('does nothing for a config that declares no variables', () => {
    expect(parseAppEnv(defineDeployConfig({}), { VUESTRATA_ANYTHING: 'x' })).toEqual({})
  })
})

describe('the shape of the declaration', () => {
  const reserved = Object.values(ENV_KEYS)

  it.each([
    ['a name without the prefix', { STRIPE_KEY: z.string() }, /VUESTRATA_ followed by/],
    ['a lower-case name', { VUESTRATA_stripe: z.string() }, /VUESTRATA_ followed by/],
    ['a name with a dash', { 'VUESTRATA_STRIPE-KEY': z.string() }, /VUESTRATA_ followed by/],
    ['a built-in variable', { [ENV_KEYS.apiUrl]: z.string() }, /built-in variable/],
    ['a compile-time variable', { [ENV_KEYS.runtimeMode]: z.string() }, /built-in variable/],
  ])('refuses %s', (_, env, message) => {
    const declared = { env } as DeployConfig

    expect(describeDeployConfigIssues(declared, reserved).join('\n')).toMatch(message)
    expect(() => parseAppEnv(declared, {}, { reservedKeys: reserved })).toThrow(message)
  })

  it('refuses a runtime key that is not declared', () => {
    const declared = {
      env: { VUESTRATA_DECLARED: z.string().optional() },
      runtime: ['VUESTRATA_OTHER'],
    } as DeployConfig

    expect(describeDeployConfigIssues(declared, reserved)).toEqual([
      'runtime: "VUESTRATA_OTHER" is not declared under env.',
    ])
  })

  it('accepts a well-formed declaration', () => {
    expect(describeDeployConfigIssues(config, reserved)).toEqual([])
    expect(describeDeployConfigIssues({}, reserved)).toEqual([])
  })
})

describe('resolveAppEnv (lenient, in the browser)', () => {
  it('agrees with the strict parser on valid input', () => {
    expect(resolveAppEnv(config, valid)).toEqual(parseAppEnv(config, valid))
  })

  it('falls back to the default for an invalid value, with a warning', () => {
    const onWarn = vi.fn()

    const env = resolveAppEnv(
      config,
      { ...valid, VUESTRATA_FEATURE_BILLING: 'maybe', VUESTRATA_SUPABASE_URL: 'not a url' },
      { onWarn },
    )

    expect(env.VUESTRATA_FEATURE_BILLING).toBe('off')
    expect(env.VUESTRATA_SUPABASE_URL).toBeUndefined()
    expect(onWarn).toHaveBeenCalledTimes(2)
    expect(onWarn).toHaveBeenCalledWith(expect.stringContaining('VUESTRATA_FEATURE_BILLING'))
    expect(onWarn).toHaveBeenCalledWith(expect.stringContaining('VUESTRATA_SUPABASE_URL'))
  })

  it('never throws: a required variable nobody set is undefined, with a warning', () => {
    const onWarn = vi.fn()

    const env = resolveAppEnv(config, {}, { onWarn })

    expect(env.VUESTRATA_MAPS_KEY).toBeUndefined()
    expect(env.VUESTRATA_FEATURE_BILLING).toBe('off')
    expect(onWarn).toHaveBeenCalledTimes(1)
    expect(onWarn).toHaveBeenCalledWith(expect.stringContaining('VUESTRATA_MAPS_KEY'))
  })

  it('does not require a warning sink', () => {
    expect(() => resolveAppEnv(config, { VUESTRATA_PAGE_SIZE: 'many' })).not.toThrow()
  })
})
