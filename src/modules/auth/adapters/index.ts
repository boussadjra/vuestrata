// The adapter types come from core/lib, not './types': this file is not part of
// the unit base.ts, jwt.ts and types.ts are replaced as, so it can sit beside a
// 1.0 types.ts, whose AuthAdapter is not the one the registry builds.
import type { AuthAdapter, AuthCapabilities } from '~/lib/auth/adapter'

import { UnsupportedAuthCapabilityError } from './types'

export * from './types'
export { isJwtExpired } from './jwt'
export {
  createAuthAdapter,
  loadAuthAdapter,
  registeredAuthAdapters,
  resolveAuthAdapterName,
} from './registry'

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
