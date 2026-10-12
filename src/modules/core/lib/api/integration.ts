/**
 * How the API client is taught a backend's conventions.
 *
 * The client used to know one backend: a JSON 401 means "sign in again",
 * errors look like `{ message, code, details }`, the CSRF token is in a meta
 * tag. Every other convention meant editing `client.ts`, a file `vuestrata
 * upgrade` replaces. This module is the alternative: the project describes its
 * backend in `app/config/api.overrides.ts`, the bootstrap resolves that into an
 * `ApiIntegration` and installs it in a `core/lib/runtime.ts` slot, and the
 * client reads the slot on every request.
 *
 * Four things can be changed:
 *
 *   request hooks   headers every request carries (a tenant, a gateway key)
 *   classifiers     how the backend says "not signed in" or "bad CSRF token"
 *   error mappers   how a failed response's body becomes an `AppError`
 *   csrf            where the token is read from and which header returns it
 *
 * plus two settings, the timeout and the correlation headers, and one thing
 * the client itself never reads: the collection dialect, which is how
 * `createCollectionApi` asks this backend for a list (see `dialects.ts`).
 *
 * With nothing installed the client uses `DEFAULT_API_INTEGRATION`, so
 * `core/lib` and its tests need no setup.
 *
 * Framework-agnostic. The one header that needs the app layer, `Accept-Language`
 * from the active locale, is a request hook the bootstrap contributes.
 */
import type { MappedError } from '~/lib/errors'
import { tryGetApiIntegration } from '~/lib/runtime'

import { unauthorizedStatus } from './classifiers'
import {
  createCsrfPrimeState,
  DEFAULT_CSRF_STRATEGY,
  type CsrfPrimeState,
  type CsrfStrategy,
} from './csrf'
import {
  resolveCollectionDialect,
  type CollectionDialect,
  type ResolvedCollectionDialect,
} from './dialects'
import { vuestrataErrorMapper } from './error-mappers'
import { DEFAULT_TRACING, resolveTracing, type ApiTracing, type ApiTracingOptions } from './tracing'

export type { MappedError } from '~/lib/errors'

/** What a request hook sees of the request about to be sent. */
export interface ApiRequestContext {
  /**
   * The request URL, resolved against the API base URL, without the query
   * string.
   *
   * Hooks run for requests to the API's own origin only. A call to another
   * origin (`apiFetch('https://hooks.example/notify')`) gets none of them,
   * unless it says `trusted: true`; a hook that adds a secret for one host
   * among several trusted ones should still check this.
   */
  readonly url: string
  /** Upper-cased: `GET`, `POST`, … */
  readonly method: string
  /**
   * The headers so far: the caller's, the session's `Authorization`, the CSRF
   * header, `Accept`, and whatever earlier hooks set.
   *
   * That includes the bearer token, by design: a hook that signs a request
   * needs to see what it signs. A hook is the project's own code, running with
   * the same access as the rest of the app; do not pass `headers` to anything
   * that is not.
   */
  readonly headers: Headers
  /** Set a header, or remove it with `null`. */
  readonly setHeader: (name: string, value: string | null | undefined) => void
  /**
   * Whether the code that made this request set the header itself, in its own
   * `headers` option. A hook that supplies a default should leave such a
   * header alone, as the `headers` table does: the call knows better.
   */
  readonly hasCallerHeader: (name: string) => boolean
}

/**
 * Runs before each request, after the client has applied authentication,
 * `credentials` and CSRF. May be async. A hook that throws fails the request
 * with an `AppError` (`REQUEST_HOOK_FAILED`), and one that never settles fails
 * it as a timeout when the request's deadline passes.
 *
 * A hook can add and change headers. It cannot take away what the client
 * applied: an `Authorization` or CSRF header the client set is put back after
 * the hooks have run.
 */
export type ApiRequestHook = (context: ApiRequestContext) => void | Promise<void>

/** What a classifier or an error mapper sees of a response. */
export interface ApiResponseContext {
  /** The request URL, resolved against the API base URL, without the query string. */
  readonly url: string
  readonly method: string
  readonly status: number
  /** Whether the status is a success (2xx). */
  readonly ok: boolean
  readonly headers: Headers
  /** The body's media type, lower-cased, without parameters. Empty when none was declared. */
  readonly contentType: string
  /** Whether `fetch` followed a redirect to get this response. */
  readonly redirected: boolean
  /** Where the response came from: differs from `url` after a redirect. */
  readonly responseUrl: string
  /** The parsed body: JSON as a value, text as a string. */
  readonly body: unknown
  /**
   * Whether the request asked for JSON and nothing else: it went out with the
   * client's own `Accept: application/json`, or the call said `expectJson`. A
   * call that set its own `Accept` decides for itself what it can read.
   */
  readonly expectsJson: boolean
}

/**
 * What a response means, beyond its status:
 *
 *   unauthenticated  the session is missing or expired. The client refreshes
 *                    it and replays the request, once; failing that, the
 *                    session is reported expired
 *   csrf             the CSRF token was missing or stale. The client reads a
 *                    new one (priming it if the strategy can) and replays, once
 *   forbidden        signed in, and not allowed. Never refreshed or replayed.
 *                    Return it to stop a later classifier reading the same
 *                    response as `unauthenticated`
 *   unexpected       a success that is not the API's answer: a web page where
 *                    data was asked for. The call fails with
 *                    `UNEXPECTED_RESPONSE`; nothing is refreshed or replayed
 *
 * `unauthenticated` and `csrf` send the request again. Answer them only when
 * the response shows the first attempt was refused: replaying a `POST` the
 * backend applied applies it twice.
 */
export type ApiResponseClass = 'unauthenticated' | 'csrf' | 'forbidden' | 'unexpected'

/**
 * Runs on every response, successful or not. Returns a class, or `null` to
 * leave the response to the next classifier. The first answer wins.
 */
export type ApiResponseClassifier = (context: ApiResponseContext) => ApiResponseClass | null

/**
 * Runs on a failed response (4xx or 5xx). Returns what it recognised in the
 * body, or `null` when the body is not in its format, which hands the response
 * to the next mapper. The built-in Vuestrata mapper always runs last.
 */
export type ApiErrorMapper = (context: ApiResponseContext) => MappedError | null

/**
 * Headers to send with every request: a value, or a function that produces
 * one per request. A function that returns nothing sends no header, and a
 * header the call set itself is left as the call set it.
 */
export type ApiHeaders = Record<
  string,
  string | ((context: ApiRequestContext) => string | null | undefined)
>

/**
 * The project's collection dialect: how this backend paginates, sorts and
 * filters a list, and what it wraps a record in. See `dialects.ts`.
 */
export type ApiCollectionOptions = CollectionDialect

/** The options a preset and the overrides file share. */
export interface ApiConventions {
  /** Headers every request carries. */
  headers?: ApiHeaders
  /** Hooks that run before every request, in order. */
  request?: ApiRequestHook | readonly ApiRequestHook[]
  /** How this backend signals an expired session or a rejected CSRF token. */
  classify?: ApiResponseClassifier | readonly ApiResponseClassifier[]
  /** How this backend formats an error body. */
  errors?: ApiErrorMapper | readonly ApiErrorMapper[]
  /** Where the CSRF token comes from. Used under the cookie transport only. */
  csrf?: CsrfStrategy
  /** How long a request may take before it fails as a timeout. */
  timeoutMs?: number
  /** Correlation headers. Off by default: they cost a CORS preflight. */
  tracing?: ApiTracingOptions
  /**
   * What to do when the API answers with a redirect. `follow`, the default, is
   * what `fetch` does. `error` fails the request instead.
   *
   * It matters for what travels with the request. When a redirect leaves the
   * API's origin, the browser drops `Authorization` and sends only the cookies
   * of the new origin, but every other header goes along: the CSRF token, and
   * whatever `headers` and `request` add, such as a gateway key. `fetch` cannot
   * follow same-origin redirects only, so an API that never redirects its
   * clients is best served by `error`. It cannot be combined with
   * `loginRedirect()`, which reads the page a redirect ended on.
   */
  redirect?: 'follow' | 'error'
  /**
   * The dialect every `createCollectionApi` call uses unless it names its
   * own: one of `dialects` (`core/lib/api/dialects`), or the project's.
   * Without one, collections speak Vuestrata's own contract.
   */
  collection?: ApiCollectionOptions
}

/** A backend's conventions, bundled: see `core/lib/api/presets`. */
export interface ApiBackendPreset extends ApiConventions {
  /** For log lines and error messages. */
  name: string
}

/**
 * What `app/config/api.overrides.ts` exports.
 *
 * How a preset and the options beside it combine:
 *
 *   headers, request   run in this order: the preset's `headers`, your
 *                      `headers`, the preset's `request` hooks, your `request`
 *                      hooks. Later ones see and can replace what earlier ones
 *                      set, so yours win over the preset's
 *   classify, errors   yours run first, then the preset's, then the
 *                      built-ins, and the first to answer wins
 *   csrf, timeoutMs,   yours replaces the preset's whole value; to change one
 *   tracing, redirect  field, spread the preset's:
 *                      `csrf: { ...csrfPresets.laravel, prime: '/csrf' }`
 *   collection         yours replaces the preset's; to change part of one:
 *                      `collection: extendDialect(dialects.laravel, { keys: 'camel' })`
 */
export interface ApiOverrides extends ApiConventions {
  /** A preset to start from: `presets.laravel`, `presets.django`, … */
  backend?: ApiBackendPreset
}

/** What the client reads on every request. Every field is present. */
export interface ApiIntegration {
  readonly requestHooks: readonly ApiRequestHook[]
  readonly classifiers: readonly ApiResponseClassifier[]
  readonly errorMappers: readonly ApiErrorMapper[]
  readonly csrf: CsrfStrategy
  readonly timeoutMs: number
  readonly tracing: ApiTracing
  readonly redirect: 'follow' | 'error'
  /**
   * What the client remembers about priming the CSRF token between requests.
   * Mutable, and the only part that is. Absent from the built-in defaults,
   * whose strategy has no prime step.
   */
  readonly csrfPrime?: CsrfPrimeState
  /**
   * The project's collection dialect, with its defaults filled in. Absent
   * when neither the overrides nor the preset names one: collections then
   * speak Vuestrata's own contract. Read by `createCollectionApi`, never by
   * the client.
   */
  readonly collection?: ResolvedCollectionDialect
}

/**
 * The client's behaviour with nothing configured: a 401 is an expired session,
 * errors are Vuestrata's own shape, the CSRF token is in a meta tag, a request
 * may take 15 seconds, redirects are followed, and no correlation header is
 * sent.
 */
export const DEFAULT_API_INTEGRATION: ApiIntegration = Object.freeze({
  requestHooks: Object.freeze([]),
  classifiers: Object.freeze([unauthorizedStatus]),
  errorMappers: Object.freeze([vuestrataErrorMapper]),
  csrf: DEFAULT_CSRF_STRATEGY,
  // Hard upper bound so a hung backend cannot keep a user-facing request
  // pending indefinitely; individual callers can still override it.
  timeoutMs: 15_000,
  tracing: DEFAULT_TRACING,
  redirect: 'follow',
})

/**
 * Declare what a project changes about how the app talks to its API.
 *
 * An identity function: it exists so `app/config/api.overrides.ts` is
 * type-checked against `ApiOverrides` and reads the same as the other seams. A
 * release can add optional fields to `ApiOverrides` without breaking a copy
 * written against the old one.
 */
export function defineApiOverrides(overrides: ApiOverrides): ApiOverrides {
  return overrides
}

/** What the app layer contributes that `core/lib` cannot know. */
export interface ApiIntegrationExtras {
  /** Hooks that run before the preset's and the project's, such as `Accept-Language`. */
  requestHooks?: readonly ApiRequestHook[]
}

function listOf<T>(value: T | readonly T[] | undefined): readonly T[] {
  if (value === undefined) return []
  return Array.isArray(value) ? (value as readonly T[]) : [value as T]
}

/** One hook that sets a table of headers, or nothing for an empty table. */
function headersHook(headers: ApiHeaders | undefined): ApiRequestHook[] {
  const entries = Object.entries(headers ?? {})
  if (entries.length === 0) return []
  return [
    (context) => {
      for (const [name, value] of entries) {
        // `apiGet(url, { headers })` is the more specific instruction.
        if (context.hasCallerHeader(name)) continue
        const resolved = typeof value === 'function' ? value(context) : value
        // A function with nothing to say (no tenant selected yet) sends no
        // header, and leaves one an earlier hook set alone.
        if (resolved !== null && resolved !== undefined && resolved !== '') {
          context.setHeader(name, resolved)
        }
      }
    },
  ]
}

function validTimeout(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

/**
 * The shape the runtime slot holds: the preset expanded, the project's options
 * applied over it, and the built-ins in place — every field present, so the
 * client never branches on `undefined`. See `ApiOverrides` for the order.
 */
export function resolveApiIntegration(
  overrides: ApiOverrides = {},
  extras: ApiIntegrationExtras = {},
): ApiIntegration {
  const preset = overrides.backend
  const csrf = overrides.csrf ?? preset?.csrf ?? DEFAULT_API_INTEGRATION.csrf
  const collection = overrides.collection ?? preset?.collection

  return {
    requestHooks: [
      ...(extras.requestHooks ?? []),
      ...headersHook(preset?.headers),
      ...headersHook(overrides.headers),
      ...listOf(preset?.request),
      ...listOf(overrides.request),
    ],
    classifiers: [
      ...listOf(overrides.classify),
      ...listOf(preset?.classify),
      ...DEFAULT_API_INTEGRATION.classifiers,
    ],
    errorMappers: [
      ...listOf(overrides.errors),
      ...listOf(preset?.errors),
      ...DEFAULT_API_INTEGRATION.errorMappers,
    ],
    csrf,
    timeoutMs:
      validTimeout(overrides.timeoutMs) ??
      validTimeout(preset?.timeoutMs) ??
      DEFAULT_API_INTEGRATION.timeoutMs,
    tracing: resolveTracing(overrides.tracing ?? preset?.tracing),
    redirect: (overrides.redirect ?? preset?.redirect) === 'error' ? 'error' : 'follow',
    // Only a strategy that can prime has anything to remember, which keeps an
    // empty overrides file resolving to exactly the defaults.
    ...(csrf.source !== 'none' && csrf.prime ? { csrfPrime: createCsrfPrimeState() } : {}),
    // Resolved here, at boot, so a value that is not a dialect fails the boot
    // with its name instead of failing every list with a schema error.
    ...(collection === undefined ? {} : { collection: resolveCollectionDialect(collection) }),
  }
}

/** The installed integration, or the defaults when the bootstrap installed none. */
export function currentApiIntegration(): ApiIntegration {
  return tryGetApiIntegration() ?? DEFAULT_API_INTEGRATION
}
