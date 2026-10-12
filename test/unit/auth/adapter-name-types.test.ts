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

import { readAuthConfig } from '../../../scripts/vite/vuestrata-plugin.mjs'

/**
 * The TYPE of the configured adapter.
 *
 * Opening the adapter registry must not change it for a project that registers
 * nothing. `AppConfig` is in `app/types/index.ts`, which is the project's file:
 * an upgraded project still declares `authProvider: 'jwt' | 'oauth' | 'mock'`
 * there, and Vuestrata's `app.config.ts` assigns `runtimeEnv.authAdapter` to
 * it. When that type was widened to admit any string, every upgraded project
 * stopped compiling until it edited a file an upgrade cannot touch.
 *
 * It is now the built-in union plus the keys of an interface the project
 * extends itself, so it widens only for a project that asks. These are checked
 * by `vue-tsc` (`vp check`), which is where an upgraded project would fail.
 *
 * Every assertion is written against `Declared`, what THIS checkout declares,
 * and not against "nothing": a project that follows the recipe and declares
 * its own adapter still carries this file, and a type test that demanded an
 * empty interface would fail its `vp check` and its build the moment it did.
 * In the template `Declared` is `never`, and each line then says exactly "the
 * union it always was" — a widening to `string` fails it in either checkout.
 *
 * `session` joined the built-in adapters in 1.1.0, which widens the union for
 * every project, declared or not. That is the one change this file exists to
 * make deliberate: the 1.1.0 migration rewrites the `authProvider` line of an
 * upgraded project's `app/types/index.ts` to `AuthAdapterName`
 * (`appConfigAdapterName` in packages/cli/migrations/1.1.0/project-files.mjs),
 * and a file it does not recognise gets a note with the line to write. A
 * built-in adapter added later needs nothing more: the project's type then
 * follows this one.
 */
type ReleasedUnion = 'mock' | 'jwt' | 'oauth' | 'session'

/** The adapter names this checkout declares from `auth.config.ts`. */
type Declared = keyof RegisteredAuthAdapterNames

/** What the type has to be here: the released union, and those names. */
// oxlint-disable-next-line typescript/no-redundant-type-constituents -- `never` until a project declares one
type Expected = ReleasedUnion | Declared

/** A maintainer's run reads this repository as the template, as it ships. */
const MAINTAINER = process.env.VUESTRATA_MAINTAINER === '1'

describe('the type of the configured auth adapter', () => {
  it('is the union it always was, plus exactly what the project declared', () => {
    expectTypeOf<BuiltinAuthAdapterName>().toEqualTypeOf<ReleasedUnion>()
    expectTypeOf<AuthAdapterName>().toEqualTypeOf<Expected>()
    expectTypeOf<RuntimeEnv['authAdapter']>().toEqualTypeOf<Expected>()
  })

  it('still fits what a project’s own AppConfig declares', () => {
    // `AppConfig['authProvider']` is `AuthAdapterName` in a project created
    // from 1.1.0 and in one its migration reached; this is that file here.
    expectTypeOf(authAdapter).toExtend<Expected>()
    expectTypeOf<RuntimeEnv['authAdapter']>().toExtend<AppConfig['authProvider']>()
    expectTypeOf(appConfig.authProvider).toExtend<AuthAdapterName>()
  })

  it('is what resolveAuthAdapterName answers, as it always did', () => {
    expectTypeOf(resolveAuthAdapterName).returns.toEqualTypeOf<Expected>()
  })

  it('is declared for every adapter auth.config.ts registers, and for no other', () => {
    // What the build reads, and warns about when the two lists differ. True
    // of the file as it ships (both empty) and of a project that follows the
    // recipe.
    const { adapters, declared } = readAuthConfig(process.cwd())

    expect([...declared].sort()).toEqual(Object.keys(adapters).sort())
  })

  it.runIf(MAINTAINER)('ships declaring nothing, with the seeded file showing how', () => {
    const { adapters, declared } = readAuthConfig(process.cwd())
    // With nothing declared, `Declared` above is `never`, and the type
    // assertions pin the released union itself.
    expect(declared).toEqual([])
    expect(adapters).toEqual({})

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
