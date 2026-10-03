import { scannedAuthAdapters } from '../config'
import { AUTH_ADAPTERS, ENV_KEYS } from '../config/env.schema'
import { AppError } from '../errors'
import type { AuthAdapter, AuthAdapterOptions } from './adapter'
import { getAuthConfig, type ResolvedAdapterRegistration } from './config'
import { authContractMismatch, parseUser } from './user'

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

/**
 * The members of an adapter that answer with a session. `userRequired` is
 * whether the answer has to carry a user: a sign-in does (unless it is an MFA
 * challenge), a refresh does not, and a resume without one is "no session",
 * which the session restore already handles.
 */
const SESSION_METHODS = {
  login: { userRequired: true },
  register: { userRequired: true },
  verifyMagicLink: { userRequired: true },
  verifyMfa: { userRequired: true },
  exchangeCode: { userRequired: true },
  refreshToken: { userRequired: false },
  refreshSession: { userRequired: false },
  resumeSession: { userRequired: false },
} as const satisfies Partial<Record<keyof AuthAdapter, { userRequired: boolean }>>

type SessionMethod = keyof typeof SESSION_METHODS

const isContractMismatch = (err: unknown): boolean =>
  err instanceof AppError && err.code === 'CONTRACT_MISMATCH'

/**
 * Hold a project's adapter to the contracts the built-in ones are held to.
 *
 * The built-in adapters get both of these from `createAuthEndpoints`, which
 * every response of theirs passes through. A project's adapter talks to an SDK
 * or a protocol of its own and passes through nothing, so they are applied
 * here, at the one place every adapter of a project's is built:
 *
 * - **The `User` contract.** The user of every session the adapter answers
 *   with, and of `getUser()`, goes through `parseUser`. Without this, an
 *   adapter that forwarded its SDK's user as it came could put a user with no
 *   `id`, or with an array for a role, in the store, where identity from a
 *   REST backend would have been refused. A user that does not fit is "no
 *   session": a sign-in or a refresh rejects with `CONTRACT_MISMATCH`, and
 *   `resumeSession()` and `getUser()` answer null, because a boot-time resume
 *   must never be what takes the app down. Either way one error is logged,
 *   with field paths and never the payload. That holds for a mismatch the
 *   adapter raised itself too (the recipe's adapter calls `parseUser`).
 *
 * - **`persistence: 'external'`.** An adapter that declares it says its SDK
 *   stores the session. The auth store writes a refresh token it is given to
 *   Web Storage under `VUESTRATA_SESSION_PERSISTENCE=session|local`, so the
 *   token is taken off whatever such an adapter returns, and the store is
 *   never given one to write.
 *
 * The adapter is wrapped rather than changed, and its methods still run with
 * the adapter itself as `this`.
 */
function sealAdapter(name: string, adapter: AuthAdapter): AuthAdapter {
  const external = adapter.persistence === 'external'
  const sealed = Object.create(adapter) as Record<string, unknown>

  function checked(method: SessionMethod, result: unknown): unknown {
    if (typeof result !== 'object' || result === null) return result
    const { refreshToken, user, ...rest } = result as Record<string, unknown>
    const what = `The "${name}" adapter's ${method}()`

    const session: Record<string, unknown> = rest
    if (refreshToken !== undefined && !external) session.refreshToken = refreshToken
    if (user !== null && user !== undefined) {
      session.user = parseUser(user, `${what} user`)
    } else if (SESSION_METHODS[method].userRequired && rest.mfaRequired !== true) {
      throw authContractMismatch(what, [
        { path: ['user'], code: 'custom', message: 'expected a user' },
      ])
    }
    return session
  }

  for (const method of Object.keys(SESSION_METHODS) as SessionMethod[]) {
    const original = adapter[method] as ((...args: unknown[]) => Promise<unknown>) | undefined
    if (typeof original !== 'function') continue
    sealed[method] = async (...args: unknown[]) => {
      try {
        return checked(method, await original.apply(adapter, args))
      } catch (err) {
        // Nothing to resume is the ordinary answer at boot; a user that does
        // not fit the contract is that answer too, already logged.
        if (method === 'resumeSession' && isContractMismatch(err)) return null
        throw err
      }
    }
  }

  sealed.getUser = async () => {
    try {
      const user = await adapter.getUser()
      return user === null || user === undefined
        ? null
        : parseUser(user, `The "${name}" adapter's getUser() user`)
    } catch (err) {
      if (isContractMismatch(err)) return null
      throw err
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
  if (typeof (adapter as PromiseLike<unknown> | null)?.then === 'function') {
    // `name: () => import('…')`: the factory is the import itself.
    throw new Error(
      `The "${name}" adapter registered in ${AUTH_CONFIG_FILE} is a function that returns a ` +
        'promise, not an adapter. A module loaded on demand is registered with `load`: ' +
        `register it as \`${name}: { load: () => import(…) }\`.`,
    )
  }
  if (!isAdapterShaped(adapter)) {
    throw new Error(
      `The "${name}" adapter registered in ${AUTH_CONFIG_FILE} did not return an auth adapter: ` +
        'it needs `transport`, `capabilities`, `login`, `logout` and `getUser`.',
    )
  }
  // The build validated VUESTRATA_SESSION_PERSISTENCE against the transport
  // written in the config file, which it read as text. If the adapter turns
  // out to use the other one, that validation was for the wrong thing. It is
  // compared with the registration as it evaluated, and with what the build
  // read: the two can differ, and the build's reading is the one the rule was
  // checked against. (No reading for this name means nothing validated it: a
  // test, or a Vite config without the plugin.)
  const read = Object.hasOwn(scannedAuthAdapters, name) ? scannedAuthAdapters[name] : undefined
  const expected =
    adapter.transport !== registration.transport
      ? registration.transport
      : read !== undefined && adapter.transport !== read
        ? read
        : undefined
  if (expected !== undefined) {
    throw new Error(
      `${AUTH_CONFIG_FILE} registers "${name}" as a ${expected}-transport adapter` +
        (expected === read && expected !== registration.transport ? ', as the build read it' : '') +
        `, but the adapter it builds uses "${adapter.transport}". Declare it: ` +
        `\`${name}: { transport: '${adapter.transport}', … }\`.`,
    )
  }
  return sealAdapter(name, adapter)
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
