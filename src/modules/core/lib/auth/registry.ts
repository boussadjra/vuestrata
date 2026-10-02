import { AUTH_ADAPTERS, ENV_KEYS } from '../config/env.schema'
import type { AuthAdapter, AuthAdapterOptions } from './adapter'
import { getAuthConfig, type ResolvedAdapterRegistration } from './config'

/**
 * The adapters a project registered under `adapters` in
 * `app/config/auth.config.ts`: building one, and fetching one that is loaded on
 * demand.
 *
 * The built-in adapters are not here. They are code of the auth module
 * (`src/modules/auth/adapters/registry.ts`), which tries them first and comes
 * here for any other name. This half is in `core/lib` so that the bootstrap
 * can resolve a lazy adapter without importing a name the auth module's barrel
 * — a file the project owns — may not export yet.
 */

/** Where a project registers its own adapters. Named in every message here. */
export const AUTH_CONFIG_FILE = 'src/modules/app/config/auth.config.ts'

/** The names registered in the configuration in force. */
export function registeredAuthAdapterNames(): string[] {
  return Object.keys(getAuthConfig().adapters)
}

const isAdapterShaped = (value: unknown): value is AuthAdapter => {
  const adapter = value as Partial<AuthAdapter> | null
  return (
    typeof adapter === 'object' &&
    adapter !== null &&
    (adapter.transport === 'bearer' || adapter.transport === 'cookie') &&
    typeof adapter.login === 'function' &&
    typeof adapter.logout === 'function' &&
    typeof adapter.getUser === 'function' &&
    typeof adapter.capabilities === 'object' &&
    adapter.capabilities !== null
  )
}

/** The members of an adapter that answer with a session, and so with tokens. */
const SESSION_METHODS = [
  'login',
  'register',
  'refreshToken',
  'verifyMagicLink',
  'verifyMfa',
  'exchangeCode',
  'resumeSession',
  'refreshSession',
] as const

/**
 * Keep an SDK-owned session's refresh token out of the app.
 *
 * An adapter that declares `persistence: 'external'` says its SDK stores the
 * session. The auth store writes a refresh token it is given to Web Storage
 * under `VUESTRATA_SESSION_PERSISTENCE=session|local`, so the guarantee is made
 * here, at the one place every session passes through: the token is taken off
 * whatever such an adapter returns, and the store is never given one to write.
 * The adapter is wrapped rather than changed, and its methods still run with
 * the adapter itself as `this`.
 */
function withoutRefreshTokens(adapter: AuthAdapter): AuthAdapter {
  const sealed = Object.create(adapter) as Record<string, unknown>
  for (const method of SESSION_METHODS) {
    const original = adapter[method] as ((...args: unknown[]) => Promise<unknown>) | undefined
    if (typeof original !== 'function') continue
    sealed[method] = async (...args: unknown[]) => {
      const result = await original.apply(adapter, args)
      if (typeof result !== 'object' || result === null || !('refreshToken' in result)) {
        return result
      }
      const { refreshToken: _dropped, ...session } = result as { refreshToken?: unknown }
      return session
    }
  }
  return sealed as unknown as AuthAdapter
}

/** Check what a project's factory returned, and apply what it declared. */
function finishAdapter(
  name: string,
  registration: ResolvedAdapterRegistration,
  adapter: unknown,
): AuthAdapter {
  if (!isAdapterShaped(adapter)) {
    throw new Error(
      `The "${name}" adapter registered in ${AUTH_CONFIG_FILE} did not return an auth adapter: ` +
        'it needs `transport`, `capabilities`, `login`, `logout` and `getUser`.',
    )
  }
  // The build validated VUESTRATA_SESSION_PERSISTENCE against the transport
  // written in the config file, which it read as text. If the adapter turns
  // out to use the other one, that validation was for the wrong thing.
  if (adapter.transport !== registration.transport) {
    throw new Error(
      `${AUTH_CONFIG_FILE} registers "${name}" as a ${registration.transport}-transport adapter, ` +
        `but the adapter it builds uses "${adapter.transport}". Declare it: ` +
        `\`${name}: { transport: '${adapter.transport}', … }\`.`,
    )
  }
  return adapter.persistence === 'external' ? withoutRefreshTokens(adapter) : adapter
}

/**
 * Build the adapter a project registered as `name`, or return `undefined` when
 * it registered none by that name.
 *
 * Synchronous. An adapter registered with `load` has to have been fetched
 * first (`loadAuthAdapter`); asking for it before that throws, saying so.
 */
export function createRegisteredAuthAdapter(
  name: string,
  options: AuthAdapterOptions = {},
): AuthAdapter | undefined {
  const config = getAuthConfig()
  if (!Object.hasOwn(config.adapters, name)) return undefined

  const registration = config.adapters[name]!
  const factory = registration.create ?? config.lazy.loaded.get(name)
  if (!factory) {
    throw new Error(
      `The "${name}" auth adapter is loaded on demand and has not been loaded yet. Await ` +
        `loadAuthAdapter("${name}") first; boot() does, before it wires auth.`,
    )
  }
  return finishAdapter(name, registration, factory(options))
}

/**
 * Make the configured adapter buildable: fetch the module of one registered
 * with `load`. Resolves at once for every other adapter, built-in or not.
 *
 * `boot()` awaits it once, so a deployment that selects an SDK-backed adapter
 * downloads that SDK and no other deployment does. A name that is neither
 * built in nor registered, a module that cannot be fetched and a module with no
 * factory all reject, and `boot()` shows the failure screen: there is no
 * adapter to fall back to that would not be the wrong one.
 */
export async function loadAuthAdapter(adapterName: string | undefined): Promise<void> {
  // No name is the mode's default, which is always a built-in adapter.
  if (!adapterName) return

  const config = getAuthConfig()
  if (!Object.hasOwn(config.adapters, adapterName)) {
    if ((AUTH_ADAPTERS as readonly string[]).includes(adapterName)) return
    throw new Error(unknownAuthAdapterMessage(adapterName))
  }

  const { load } = config.adapters[adapterName]!
  const { loaded, loading } = config.lazy
  if (!load || loaded.has(adapterName)) return

  // Callers that arrive while the module is on its way share the one request.
  const inFlight = loading.get(adapterName)
  if (inFlight) return inFlight

  const fetching: Promise<void> = Promise.resolve()
    .then(load)
    .then((module) => {
      const factory = module?.default
      if (typeof factory !== 'function') {
        throw new Error('its module has no default export that is a factory function')
      }
      loaded.set(adapterName, factory)
    })
    .catch((err: unknown) => {
      throw new Error(
        `Could not load the "${adapterName}" auth adapter registered in ${AUTH_CONFIG_FILE}: ` +
          (err instanceof Error ? err.message : String(err)),
        { cause: err },
      )
    })
    .finally(() => {
      // Loaded, or failed: either way the next call starts from what is true.
      loading.delete(adapterName)
    })
  loading.set(adapterName, fetching)
  return fetching
}

/**
 * What to say about an adapter name nothing knows.
 *
 * @param builtin The built-in names this build has; `mock` exists only in a
 *   demo build, and only the auth module knows which kind this is.
 */
export function unknownAuthAdapterMessage(
  adapterName: string,
  builtin: readonly string[] = AUTH_ADAPTERS,
): string {
  return (
    `Unknown ${ENV_KEYS.authAdapter} value "${adapterName}". Built in: ${builtin.join(', ')}. ` +
    `To use your own adapter, register it under \`adapters\` in ${AUTH_CONFIG_FILE}.`
  )
}
