import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, expectTypeOf, it } from 'vite-plus/test'

import { appConfig, authAdapter } from '@/config/app.config'
import type {
  AuthAdapterName,
  BuiltinAuthAdapterName,
  RegisteredAuthAdapterNames,
} from '@/lib/auth'
import { resolveAuthAdapterName } from '@/modules/auth'
import type { RuntimeEnv } from '~/lib/config'
import type { AppConfig } from '~/types'

/**
 * The TYPE of the configured adapter, for a project that registers none.
 *
 * Opening the adapter registry must not change it. `AppConfig` is in
 * `app/types/index.ts`, which is the project's file: an upgraded project still
 * declares `authProvider: 'jwt' | 'oauth' | 'mock'` there, and Vuestrata's
 * `app.config.ts` assigns `runtimeEnv.authAdapter` to it. When that type was
 * widened to admit any string, every upgraded project stopped compiling until
 * it edited a file an upgrade cannot touch.
 *
 * It is now the built-in union plus the keys of an interface the project
 * extends itself, so it widens only for a project that asks. These are checked
 * by `vue-tsc` (`vp check`), which is where an upgraded project would fail.
 *
 * Nothing in the test suite may augment `RegisteredAuthAdapterNames`: the
 * declaration would hold for the whole program, and hide exactly this.
 */
type ReleasedUnion = 'mock' | 'jwt' | 'oauth'

describe('the type of the configured auth adapter', () => {
  it('is the union it always was while the project registers nothing', () => {
    expectTypeOf<keyof RegisteredAuthAdapterNames>().toBeNever()
    expectTypeOf<BuiltinAuthAdapterName>().toEqualTypeOf<ReleasedUnion>()
    expectTypeOf<AuthAdapterName>().toEqualTypeOf<ReleasedUnion>()
    expectTypeOf<RuntimeEnv['authAdapter']>().toEqualTypeOf<ReleasedUnion>()
  })

  it('still fits what a project’s own AppConfig declares', () => {
    // What `app/types/index.ts` says in a project created before this.
    expectTypeOf(authAdapter).toExtend<ReleasedUnion>()
    expectTypeOf<RuntimeEnv['authAdapter']>().toExtend<AppConfig['authProvider']>()
    expectTypeOf(appConfig.authProvider).toExtend<AuthAdapterName>()
  })

  it('is what resolveAuthAdapterName answers, as it always did', () => {
    expectTypeOf(resolveAuthAdapterName).returns.toEqualTypeOf<ReleasedUnion>()
  })

  it('is widened from auth.config.ts, where the seeded file shows how', () => {
    const seeded = fs.readFileSync(
      path.join(process.cwd(), 'src/modules/app/config/auth.config.ts'),
      'utf8',
    )

    // As a comment: the shipped file registers nothing and declares nothing.
    expect(seeded).toMatch(
      /\* {3}declare module '~\/lib\/auth' \{\n \* {5}interface RegisteredAuthAdapterNames \{/,
    )
    expect(seeded).not.toMatch(/^declare module/m)
  })
})
