import { AUTH_ADAPTER_ENV_KEY } from '~/config/app.config'
import { createScopedLogger } from '~/lib/logger'

import { createJwtAdapter } from './jwt'
import { createMockAdapter } from './mock'
import { createOAuthAdapter } from './oauth'
import {
  SUPPORTED_AUTH_ADAPTERS,
  UnsupportedAuthCapabilityError,
  type AuthAdapter,
  type AuthCapabilities,
  type SupportedAuthAdapter,
} from './types'

const adapterLogger = createScopedLogger('auth:adapter')

export * from './types'
export { isJwtExpired } from './jwt'

export function resolveAuthAdapterName(adapterName: string | undefined): SupportedAuthAdapter {
  if (!adapterName) return 'mock'
  if ((SUPPORTED_AUTH_ADAPTERS as readonly string[]).includes(adapterName)) {
    return adapterName as SupportedAuthAdapter
  }
  adapterLogger.warn(
    `Unknown ${AUTH_ADAPTER_ENV_KEY} value "${adapterName}", falling back to "mock".`,
  )
  return 'mock'
}

/**
 * `createJwtAdapter`, as this file calls it.
 *
 * The second getter is new in 1.1.0. `jwt.ts`, `base.ts` and `types.ts` are
 * replaced together or not at all, and this file is not one of them: it is
 * where a project registers an adapter of its own, and that edit must not cost
 * it the session fixes in the other three. So this file can be the release's
 * beside a `jwt.ts` the project kept, whose factory takes the access-token
 * getter alone. Called with two arguments that does not compile; a function of
 * one parameter does fit this type, and ignores the second.
 */
const createJwt: (
  getToken?: () => string | null,
  getRefreshToken?: () => string | null,
) => AuthAdapter = createJwtAdapter

/**
 * Build the configured adapter.
 *
 * `getToken` is threaded through for the JWT adapter's expiry check, and
 * `getRefreshToken` for the refresh token it presents when one is held in
 * memory. Both are callbacks rather than values because the adapter is
 * constructed once and the tokens change on every refresh.
 */
export function createAuthAdapter(
  adapterName: string | undefined,
  options: { getToken?: () => string | null; getRefreshToken?: () => string | null } = {},
): AuthAdapter {
  const name = resolveAuthAdapterName(adapterName)

  switch (name) {
    case 'jwt':
      return createJwt(options.getToken, options.getRefreshToken)
    case 'oauth':
      return createOAuthAdapter()
    case 'mock':
    default:
      return createMockAdapter()
  }
}

/**
 * Narrow an optional adapter method to a callable one, or throw a message that
 * names the adapter and the missing capability.
 *
 * Call sites use this instead of `adapter.setupMfa!()`. The non-null assertion
 * would crash with "not a function" and no indication of which adapter is
 * configured or why the method is absent.
 */
export function requireCapability<K extends keyof AuthCapabilities>(
  adapter: AuthAdapter,
  capability: K,
  method: unknown,
): asserts method is NonNullable<typeof method> {
  if (!adapter.capabilities[capability] || typeof method !== 'function') {
    throw new UnsupportedAuthCapabilityError(adapter.name, capability)
  }
}
