import type { AuthCapabilities } from '~/lib/auth/adapter'

/**
 * The adapter contract itself is declared in `core/lib/auth/adapter.ts`, and
 * re-exported here so everything that imports it from the auth module keeps
 * working. It moved because a project's `app/config/auth.config.ts` is typed
 * against it, and that file can only import what Vuestrata ships: `core/lib`
 * is, and this module's barrel is the project's.
 */
export type {
  AuthAdapter,
  AuthAdapterFactory,
  AuthAdapterOptions,
  AuthCapabilities,
  AuthProviderId,
  AuthStateChange,
  AuthTransport,
  RefreshedSession,
  ResumedSession,
} from '~/lib/auth/adapter'

/** The adapters Vuestrata ships. A project registers its own in `app/config/auth.config.ts`. */
export const SUPPORTED_AUTH_ADAPTERS = ['mock', 'jwt', 'oauth', 'session'] as const
export type SupportedAuthAdapter = (typeof SUPPORTED_AUTH_ADAPTERS)[number]

/**
 * Thrown by OAuth `login()`/`register()` to signal that the page is about to
 * be replaced by a provider redirect. Callers awaiting the promise detect it
 * with `instanceof` and skip their error UI.
 */
export class OAuthRedirectError extends Error {
  constructor(message = 'Redirecting to OAuth provider') {
    super(message)
    this.name = 'OAuthRedirectError'
  }
}

/** Raised when a caller invokes a method the configured adapter does not support. */
export class UnsupportedAuthCapabilityError extends Error {
  constructor(
    public readonly adapter: string,
    public readonly capability: keyof AuthCapabilities,
  ) {
    super(
      `The "${adapter}" auth adapter does not support "${capability}". ` +
        `Check adapter.capabilities.${capability} before calling this, or configure a different VUESTRATA_AUTH_ADAPTER.`,
    )
    this.name = 'UnsupportedAuthCapabilityError'
  }
}
