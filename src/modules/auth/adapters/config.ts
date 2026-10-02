import {
  createAuthEndpoints,
  type AuthEndpointOverrides,
  type AuthEndpoints,
  type AuthMapping,
} from './endpoints'
import {
  SUPPORTED_AUTH_ADAPTERS,
  type AuthAdapterFactory,
  type AuthCapabilities,
  type AuthProviderId,
  type AuthTransport,
} from './types'

/**
 * One adapter of the project's own, under the name `VUESTRATA_AUTH_ADAPTER`
 * selects it by.
 *
 * - A function is a factory, and its adapter uses `bearer` transport.
 * - `{ create }` is the same with the transport stated.
 * - `{ load }` is loaded on demand: `() => import('…')` of a module whose
 *   default export is the factory. An SDK registered this way is in the bundle
 *   only as a separate chunk, fetched by the deployment that selects it.
 *
 * The transport is written here, as a literal, because the build has to know
 * it without running any of this: it validates `VUESTRATA_SESSION_PERSISTENCE`
 * against it, and it reads this file as text. `boot()` then checks the adapter
 * really uses the transport declared.
 */
export type AuthAdapterRegistration =
  | AuthAdapterFactory
  | { readonly transport?: AuthTransport; readonly create: AuthAdapterFactory }
  | {
      readonly transport?: AuthTransport
      readonly load: () => Promise<{ readonly default: AuthAdapterFactory }>
    }

/** One social sign-in button on the login page. */
export interface AuthProviderOption {
  /** Sent to the adapter, and on to the backend as the `:provider` path segment. */
  readonly id: AuthProviderId
  /** An i18n key for the provider's name. Wins over `label`. */
  readonly labelKey?: string
  /** The provider's name as plain text, for a project with one language. */
  readonly label?: string
  /** An icon class, e.g. `i-logos-gitlab`. */
  readonly icon?: string
}

/**
 * Everything a project can say about authentication without editing a file of
 * Vuestrata's. Every member is optional, and an empty object is the documented
 * Vuestrata contract unchanged.
 */
export interface AuthConfig extends AuthMapping {
  /** The project's own adapters, by name. Built-in names cannot be taken. */
  readonly adapters?: Readonly<Record<string, AuthAdapterRegistration>>
  /** The endpoints that differ from `endpointPresets.vuestrata`. */
  readonly endpoints?: AuthEndpointOverrides
  /**
   * Capabilities the built-in adapters should NOT claim, for a backend that
   * has the endpoint but not the feature: `{ magicLink: false }`. It can only
   * switch one off; `true` adds nothing an adapter does not implement.
   */
  readonly capabilities?: Partial<AuthCapabilities>
  /** The social sign-in buttons, in order. Defaults to Google, GitHub, Microsoft. */
  readonly providers?: readonly AuthProviderOption[]
}

/**
 * Declare the project's auth configuration.
 *
 * An identity function: it exists so `app/config/auth.config.ts` is checked
 * against `AuthConfig` and reads the same as the other seams. A release can
 * add optional members to `AuthConfig` without breaking a copy written against
 * the old one.
 */
export function defineAuthConfig(config: AuthConfig): AuthConfig {
  return config
}

/** The buttons the login page has always had. */
export const DEFAULT_AUTH_PROVIDERS: readonly AuthProviderOption[] = [
  { id: 'google', labelKey: 'auth_provider_google', icon: 'i-logos-google-icon' },
  { id: 'github', labelKey: 'auth_provider_github', icon: 'i-logos-github-icon' },
  { id: 'microsoft', labelKey: 'auth_provider_microsoft', icon: 'i-logos-microsoft-icon' },
]

/** What an adapter name may look like. The build reads names with the same rule. */
export const AUTH_ADAPTER_NAME_PATTERN = /^[a-z][a-z0-9-]*$/

/**
 * A provider id ends up as a path segment of the authorize URL, so it is held
 * to characters that cannot change which URL that is.
 */
const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/i

/** A registered adapter, with its shorthand expanded. */
export interface ResolvedAdapterRegistration {
  readonly transport: AuthTransport
  readonly create?: AuthAdapterFactory
  readonly load?: () => Promise<{ readonly default: AuthAdapterFactory }>
}

/** The configuration in force: every member present, so readers never branch. */
export interface ResolvedAuthConfig {
  readonly adapters: Readonly<Record<string, ResolvedAdapterRegistration>>
  readonly endpoints: AuthEndpoints
  readonly capabilities: Partial<AuthCapabilities>
  readonly providers: readonly AuthProviderOption[]
}

function resolveAdapters(
  adapters: AuthConfig['adapters'] = {},
): Record<string, ResolvedAdapterRegistration> {
  const resolved: Record<string, ResolvedAdapterRegistration> = {}

  for (const [name, registration] of Object.entries(adapters)) {
    if (!AUTH_ADAPTER_NAME_PATTERN.test(name)) {
      throw new Error(
        `auth.config.ts: "${name}" is not a usable adapter name. Use lowercase letters, digits ` +
          'and dashes, starting with a letter.',
      )
    }
    if ((SUPPORTED_AUTH_ADAPTERS as readonly string[]).includes(name)) {
      throw new Error(
        `auth.config.ts: "${name}" is a built-in adapter and cannot be replaced. Register yours ` +
          'under another name; `endpoints` and the mappers configure the built-in one.',
      )
    }

    if (typeof registration === 'function') {
      resolved[name] = { transport: 'bearer', create: registration }
      continue
    }

    // Read as a loose record: this is the boundary with a file the project
    // wrote, and a JavaScript mistake there should get a message, not a
    // TypeError from a property read.
    const entry: Partial<ResolvedAdapterRegistration> =
      typeof registration === 'object' && registration !== null ? registration : {}
    const { transport = 'bearer', create, load } = entry
    if (transport !== 'bearer' && transport !== 'cookie') {
      throw new Error(
        `auth.config.ts: adapter "${name}" declares transport ${JSON.stringify(transport)}. ` +
          'It is "bearer" or "cookie".',
      )
    }
    if ((typeof create === 'function') === (typeof load === 'function')) {
      throw new Error(
        `auth.config.ts: adapter "${name}" must be a factory function, or an object with ` +
          'exactly one of `create` (a factory) and `load` (`() => import(…)` of a module whose ' +
          'default export is one).',
      )
    }
    resolved[name] = create ? { transport, create } : { transport, load }
  }

  return resolved
}

function resolveProviders(providers: AuthConfig['providers']): readonly AuthProviderOption[] {
  if (providers === undefined) return DEFAULT_AUTH_PROVIDERS

  const seen = new Set<string>()
  for (const provider of providers) {
    if (typeof provider.id !== 'string' || !PROVIDER_ID_PATTERN.test(provider.id)) {
      throw new Error(
        `auth.config.ts: ${JSON.stringify(provider.id)} is not a usable provider id. Use ` +
          'letters, digits, dashes and underscores.',
      )
    }
    if (seen.has(provider.id)) {
      throw new Error(`auth.config.ts: the provider "${provider.id}" is listed twice.`)
    }
    seen.add(provider.id)
  }
  return providers
}

/**
 * Check a project's configuration and fill in everything it left out.
 *
 * Throws on what cannot be meant, naming `auth.config.ts`, rather than letting
 * a typo stand as a default. It runs during `boot()`, so the failure is the
 * boot-failure screen and a message in the console, not a login page that
 * quietly talks to the wrong endpoint.
 */
export function resolveAuthConfig(config: AuthConfig = {}): ResolvedAuthConfig {
  return {
    adapters: resolveAdapters(config.adapters),
    endpoints: createAuthEndpoints(config.endpoints, {
      mapAuthResponse: config.mapAuthResponse,
      mapRefreshResponse: config.mapRefreshResponse,
      mapUser: config.mapUser,
      buildRefreshBody: config.buildRefreshBody,
    }),
    capabilities: config.capabilities ?? {},
    providers: resolveProviders(config.providers),
  }
}

/**
 * The configuration in force, held in `createGlobalState` so it is shared by
 * every adapter and replaceable from a test.
 *
 * `revision` moves on each install. The adapter registry keeps what it loaded
 * lazily against it, so a new configuration never hands out a factory that an
 * old one loaded.
 */
const useAuthConfigState = createGlobalState(() => ({
  config: resolveAuthConfig(),
  revision: 0,
}))

/**
 * Put the project's `auth.config.ts` in force.
 *
 * `bootstrap/seams.ts` calls it, right after the runtime backends are wired
 * and before anything builds an adapter. The auth module does not import the
 * seeded file itself: that file imports its helpers from this module's barrel,
 * and a barrel that reached back to it would be a cycle. Until this is called
 * the built-in defaults apply, which is exactly what an untouched
 * `auth.config.ts` holds.
 */
export function installAuthConfig(config: AuthConfig = {}): void {
  const state = useAuthConfigState()
  state.config = resolveAuthConfig(config)
  state.revision++
}

/** The configuration in force. */
export function getAuthConfig(): ResolvedAuthConfig {
  return useAuthConfigState().config
}

/** Which install the configuration in force came from. */
export function authConfigRevision(): number {
  return useAuthConfigState().revision
}

/** The social sign-in buttons to render, in order. */
export function getAuthProviders(): readonly AuthProviderOption[] {
  return getAuthConfig().providers
}
