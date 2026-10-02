import { AUTH_ADAPTER_ENV_KEY } from '~/config/app.config'
import {
  AUTH_CONFIG_FILE,
  createRegisteredAuthAdapter,
  registeredAuthAdapterNames,
  unknownAuthAdapterMessage,
} from '~/lib/auth/registry'

import { createJwtAdapter } from './jwt'
import { createMockAdapter } from './mock'
import { createOAuthAdapter } from './oauth'
import type { AuthAdapter, AuthAdapterFactory, AuthAdapterOptions } from './types'

// The other half of this registry: a project's adapter that is loaded on
// demand. It lives in `core/lib` because `boot()` calls it, and the bootstrap
// may only import what Vuestrata ships.
export { loadAuthAdapter } from '~/lib/auth/registry'

/**
 * The adapters Vuestrata ships, as factories.
 *
 * `mock` is behind `__VUESTRATA_DEMO__`, read when it is asked for rather than
 * when this module loads. In a production build the constant is the literal
 * `false`, the branch is dead code, and with it goes the only reference to
 * `createMockAdapter` — so `mock.ts` is not in the bundle at all, where it
 * used to ship to every real deployment. A static import is what makes that
 * work without making the adapter asynchronous: the demo, and every test and
 * call site that builds it, still gets it from a plain function call.
 */
function builtinFactory(name: string): AuthAdapterFactory | undefined {
  if (name === 'jwt') {
    return ({ getToken, getRefreshToken }) => createJwtAdapter(getToken, getRefreshToken)
  }
  if (name === 'oauth') return () => createOAuthAdapter()
  if (name === 'mock') return __VUESTRATA_DEMO__ ? () => createMockAdapter() : undefined
  return undefined
}

/** The built-in names this build has. `mock` exists in a demo build only. */
function builtinNames(): string[] {
  return __VUESTRATA_DEMO__ ? ['mock', 'jwt', 'oauth'] : ['jwt', 'oauth']
}

/** Every adapter name `VUESTRATA_AUTH_ADAPTER` can select in this build. */
export function registeredAuthAdapters(): string[] {
  return [...builtinNames(), ...registeredAuthAdapterNames()]
}

/**
 * The adapter name to use, or an error that says how to make it one.
 *
 * It used to fall back to `mock` for a name it did not know, with a warning.
 * A real deployment whose variable was mistyped then ran against endpoints
 * that only exist inside the demo's service worker, and every sign-in failed
 * with nothing on screen to say why. An unknown name is now an error, and the
 * build refuses it before this is ever reached.
 *
 * No name at all is the env schema's default: `mock` in a demo build, `jwt`
 * otherwise.
 */
export function resolveAuthAdapterName(adapterName: string | undefined): string {
  if (!adapterName) return __VUESTRATA_DEMO__ ? 'mock' : 'jwt'
  if (registeredAuthAdapters().includes(adapterName)) return adapterName

  if (adapterName === 'mock') {
    throw new Error(
      `${AUTH_ADAPTER_ENV_KEY}="mock" needs a demo build: the mock adapter's endpoints only ` +
        'exist inside MSW, and the adapter is not in a production bundle. Use "jwt", "oauth" ' +
        `or an adapter registered in ${AUTH_CONFIG_FILE}.`,
    )
  }
  throw new Error(unknownAuthAdapterMessage(adapterName, builtinNames()))
}

/**
 * Build the configured adapter.
 *
 * `getToken` is threaded through for the JWT adapter's expiry check, and
 * `getRefreshToken` for the refresh token it presents when one is held in
 * memory. Both are callbacks rather than values because the adapter is
 * constructed once and the tokens change on every refresh.
 *
 * Synchronous, for the built-in adapters and for any the project registered
 * with a factory. One registered with `load` has to be loaded first:
 * `loadAuthAdapter(name)`, which `boot()` awaits before it wires auth, so by
 * the time application code asks, this simply works.
 */
export function createAuthAdapter(
  adapterName: string | undefined,
  options: AuthAdapterOptions = {},
): AuthAdapter {
  const name = resolveAuthAdapterName(adapterName)

  const builtin = builtinFactory(name)
  if (builtin) return builtin(options)

  // `resolveAuthAdapterName` has checked the name is registered.
  return createRegisteredAuthAdapter(name, options)!
}
