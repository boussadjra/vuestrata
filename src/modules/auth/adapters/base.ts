import { getAuthConfig } from '~/lib/auth/config'
import { authLogger, type AuthEndpoints } from '~/lib/auth/endpoints'

import type { AuthProviderId } from './types'

/**
 * Refuse a provider the login page does not offer.
 *
 * The `AuthProviderId` type does not survive a `?provider=` query string or an
 * untrusted caller, and the id becomes a path segment of the authorize URL, so
 * the check has to exist at runtime too. The allowlist is the provider list in
 * force: the three built-in ones, or whatever `auth.config.ts` lists.
 */
export function assertOAuthProvider(provider: AuthProviderId): void {
  if (!getAuthConfig().providers.some((option) => option.id === provider)) {
    throw new Error(`Unsupported OAuth provider: "${provider}"`)
  }
}

/**
 * The wire calls every built-in adapter shares, for the configuration in
 * force.
 *
 * The calls themselves are built by `createAuthEndpoints`
 * (`core/lib/auth/endpoints.ts`) from the project's `auth.config.ts`, which is
 * installed during `boot()` — after this module has been evaluated. So this is
 * a view rather than a value: each property read returns the current
 * configuration's function. An adapter reads the ones it uses when it is built
 * (`login: authEndpoints.login`), and that is always after the configuration is
 * in place.
 */
export const authEndpoints: AuthEndpoints = new Proxy({} as AuthEndpoints, {
  get: (_target, key) => Reflect.get(getAuthConfig().endpoints, key),
  has: (_target, key) => Reflect.has(getAuthConfig().endpoints, key),
})

export { authLogger }
