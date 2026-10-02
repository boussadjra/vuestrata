import { AUTH_ADAPTER_ENV_KEY } from '~/config/app.config'

import { authConfigRevision, getAuthConfig, type ResolvedAdapterRegistration } from './config'
import { createJwtAdapter } from './jwt'
import { createMockAdapter } from './mock'
import { createOAuthAdapter } from './oauth'
import type { AuthAdapter, AuthAdapterFactory, AuthAdapterOptions } from './types'

/** Where a project registers its own adapters. Named in every message here. */
const AUTH_CONFIG_FILE = 'src/modules/app/config/auth.config.ts'

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
  if (name === 'jwt')
    return ({ getToken, getRefreshToken }) => createJwtAdapter(getToken, getRefreshToken)
  if (name === 'oauth') return () => createOAuthAdapter()
  if (name === 'mock') return __VUESTRATA_DEMO__ ? () => createMockAdapter() : undefined
  return undefined
}

/** The built-in names this build has. `mock` exists in a demo build only. */
function builtinNames(): string[] {
  return __VUESTRATA_DEMO__ ? ['mock', 'jwt', 'oauth'] : ['jwt', 'oauth']
}

/**
 * What has been loaded lazily, and what is on its way. Held in
 * `createGlobalState` rather than at module scope, and tied to the
 * configuration it was loaded for: a factory loaded under one `auth.config.ts`
 * is never handed out under another.
 */
const useRegistryState = createGlobalState(() => ({
  revision: -1,
  loaded: new Map<string, AuthAdapterFactory>(),
  loading: new Map<string, Promise<void>>(),
}))

function registryState() {
  const state = useRegistryState()
  const revision = authConfigRevision()
  if (state.revision !== revision) {
    state.revision = revision
    state.loaded.clear()
    state.loading.clear()
  }
  return state
}

/** Every adapter name `VUESTRATA_AUTH_ADAPTER` can select in this build. */
export function registeredAuthAdapters(): string[] {
  return [...builtinNames(), ...Object.keys(getAuthConfig().adapters)]
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
  throw new Error(
    `Unknown ${AUTH_ADAPTER_ENV_KEY} value "${adapterName}". Built in: ${builtinNames().join(', ')}. ` +
      `To use your own adapter, register it under \`adapters\` in ${AUTH_CONFIG_FILE}.`,
  )
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
      if (typeof result !== 'object' || result === null || !('refreshToken' in result))
        return result
      const { refreshToken: _dropped, ...session } = result as { refreshToken?: unknown }
      return session
    }
  }
  return sealed as unknown as AuthAdapter
}

/** Check what a project's factory returned, and apply what it declared. */
function finishCustomAdapter(
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
        `but the adapter it builds uses ${JSON.stringify(adapter.transport)}. Declare it: ` +
        `\`${name}: { transport: '${String(adapter.transport)}', … }\`.`,
    )
  }
  return adapter.persistence === 'external' ? withoutRefreshTokens(adapter) : adapter
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
  const registration = getAuthConfig().adapters[name]!
  const factory = registration.create ?? registryState().loaded.get(name)
  if (!factory) {
    throw new Error(
      `The "${name}" auth adapter is loaded on demand and has not been loaded yet. Await ` +
        `loadAuthAdapter("${name}") first; boot() does, before it wires auth.`,
    )
  }
  return finishCustomAdapter(name, registration, factory(options))
}

/**
 * Make `createAuthAdapter(name)` callable: fetch the module of an adapter
 * registered with `load`. Resolves at once for every other adapter.
 *
 * `boot()` awaits it once, so a deployment that selects an SDK-backed adapter
 * downloads that SDK and no other deployment does. A name nothing registered,
 * a module that cannot be fetched and a module with no factory all reject, and
 * `boot()` shows the failure screen: there is no adapter to fall back to that
 * would not be the wrong one.
 */
export async function loadAuthAdapter(adapterName: string | undefined): Promise<void> {
  const name = resolveAuthAdapterName(adapterName)
  if (builtinFactory(name)) return

  const load = getAuthConfig().adapters[name]!.load
  const state = registryState()
  if (!load || state.loaded.has(name)) return

  // Callers that arrive while the module is on its way share the one request.
  const inFlight = state.loading.get(name)
  if (inFlight) return inFlight

  const revision = state.revision
  const loading: Promise<void> = Promise.resolve()
    .then(load)
    .then((module) => {
      const factory = module?.default
      if (typeof factory !== 'function') {
        throw new Error('its module has no default export that is a factory function')
      }
      // A configuration installed while this was on its way does not get it.
      if (registryState().revision === revision) state.loaded.set(name, factory)
    })
    .catch((err: unknown) => {
      throw new Error(
        `Could not load the "${name}" auth adapter registered in ${AUTH_CONFIG_FILE}: ` +
          (err instanceof Error ? err.message : String(err)),
        { cause: err },
      )
    })
    .finally(() => {
      // Loaded, or failed: either way the next call starts from what is true.
      if (state.loading.get(name) === loading) state.loading.delete(name)
    })
  state.loading.set(name, loading)
  return loading
}
