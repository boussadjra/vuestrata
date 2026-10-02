/**
 * Response classifiers: how a backend says "you are not signed in" or "your
 * CSRF token is stale" when it does not say it with a JSON 401.
 *
 * `fetch` follows redirects, so a session that expired behind a
 * redirect-to-login arrives as a 200 with a login page in it. Laravel answers a
 * stale token with 419, a status no RFC defines. Django REST Framework under
 * session authentication answers an anonymous request with 403, the same
 * status it uses for a signed-in user who lacks a permission. Left unclassified,
 * each of these surfaces as a schema error or "Request failed with status 419",
 * and the user is never sent to sign in.
 *
 * A classifier looks at one response and returns what it means, or `null`.
 * Presets bundle the ones a framework needs (`core/lib/api/presets`); a
 * project adds its own under `classify` in `app/config/api.overrides.ts`.
 *
 * `unauthenticated` makes the client refresh the session and SEND THE REQUEST
 * AGAIN. For a `POST` that is only safe when the first attempt was refused
 * before it did anything, so a classifier answers it only on evidence of a
 * refusal (a 401, a 403 that says so, a redirect to the sign-in page), never
 * on a guess from what the response looks like.
 *
 * Framework-agnostic.
 */
import type { ApiResponseClass, ApiResponseClassifier, ApiResponseContext } from './integration'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * A 401 means the session is missing or expired. The client's behaviour before
 * classifiers existed, and the one that always runs last.
 */
export const unauthorizedStatus: ApiResponseClassifier = (context) =>
  context.status === 401 ? 'unauthenticated' : null

/** One status, one meaning: `statusMeans(419, 'csrf')`. */
export function statusMeans(status: number, meaning: ApiResponseClass): ApiResponseClassifier {
  return (context) => (context.status === status ? meaning : null)
}

/**
 * Paths that are a sign-in page in the frameworks the presets cover: `/login`
 * (Laravel, Spring), `/Account/Login` (ASP.NET Identity), `/accounts/login/`
 * (Django), `/signin`, `/sign-in`.
 */
export const DEFAULT_LOGIN_PATH = /(?:^|\/)(?:log-?in|sign-?in)(?:[/.]|$)/i

export interface LoginRedirectOptions {
  /** Tested against the path the redirect ended on. Defaults to `DEFAULT_LOGIN_PATH`. */
  loginPath?: RegExp
  /**
   * Also report a redirect that ended on an HTML page somewhere else, for a
   * request that asked for JSON, as an `unexpected` response. On by default:
   * the alternative is that page handed to the caller as if it were data.
   */
  html?: boolean
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}

/**
 * A request that was redirected to the sign-in page.
 *
 * Only a response `fetch` reached through a redirect qualifies, and only the
 * path it ended on says "sign in": the backend refused the request and sent
 * the browser to authenticate, so nothing was applied and the request can be
 * replayed after a refresh, whatever its method.
 *
 * A redirect that ended on an HTML page anywhere else is NOT read as an
 * expired session. It is a `POST` the backend applied and then answered with
 * a redirect to a page (replaying it would apply it twice), or a `GET` that a
 * static host's fallback page answered (refreshing would end a session that
 * is perfectly valid). The response is `unexpected` instead: the caller gets
 * an `UNEXPECTED_RESPONSE` error, nothing is refreshed and nothing is sent
 * again.
 *
 * An HTML page served directly at an API URL, with no redirect, is left alone
 * here; see `expectJson` on the API client for failing on one.
 *
 * A redirect to another origin (an identity provider) is visible only when
 * that origin allows the app's origin through CORS. Otherwise the browser
 * blocks the response, and it arrives as a network error no classifier sees.
 */
export function loginRedirect(options: LoginRedirectOptions = {}): ApiResponseClassifier {
  const { loginPath = DEFAULT_LOGIN_PATH, html = true } = options
  return (context) => {
    if (!context.redirected) return null
    if (loginPath.test(pathOf(context.responseUrl))) return 'unauthenticated'
    if (html && context.expectsJson && context.contentType === 'text/html') return 'unexpected'
    return null
  }
}

export interface AnonymousForbiddenOptions {
  /**
   * Error codes that mean "not signed in", read from `code` or from
   * `errors[].code` (the drf-standardized-errors shape). Defaults to DRF's
   * `not_authenticated` and `authentication_failed`.
   */
  codes?: readonly string[]
  /**
   * `detail` texts that mean the same, for a backend that sends no code.
   * Defaults to `DRF_ANONYMOUS_MESSAGES`: DRF's sentence in English, French and
   * Arabic. Passing a list replaces the default, so spread it to add to it:
   * `[...DRF_ANONYMOUS_MESSAGES, 'Anmeldedaten fehlen.']`.
   */
  messages?: readonly (string | RegExp)[]
}

const DRF_ANONYMOUS_CODES = ['not_authenticated', 'authentication_failed']

/**
 * `NotAuthenticated.default_detail` as DRF sends it, in the languages this
 * template ships.
 *
 * DRF translates the sentence when Django's `LocaleMiddleware` is active, and
 * the API client sends `Accept-Language`, so a French user's expired session
 * arrives in French. The translations are DRF's own, copied from its catalogs
 * (`rest_framework/locale/<lang>/LC_MESSAGES/django.po` in
 * github.com/encode/django-rest-framework, msgid "Authentication credentials
 * were not provided."), not written here: a paraphrase would match nothing.
 *
 * A sentence is the weakest signal there is. It covers three languages, and a
 * backend that rewords it or answers in a fourth is read as "not allowed". The
 * robust options are on the backend: answer 401 (give the first authentication
 * class an `authenticate_header`), or put a `code` in the body.
 */
export const DRF_ANONYMOUS_MESSAGES: readonly string[] = [
  'Authentication credentials were not provided.',
  "Informations d'authentification non fournies.",
  'لم يتم تزويد بيانات الدخول.',
]

function codesOf(body: Record<string, unknown>): string[] {
  const codes: string[] = []
  if (typeof body.code === 'string') codes.push(body.code)
  if (Array.isArray(body.errors)) {
    for (const entry of body.errors) {
      if (isRecord(entry) && typeof entry.code === 'string') codes.push(entry.code)
    }
  }
  return codes
}

/**
 * A 403 that means "not signed in" rather than "not allowed".
 *
 * Django REST Framework answers an anonymous request with 403 when session
 * authentication is the first authenticator, because there is no
 * `WWW-Authenticate` challenge to send with a 401. The status alone cannot tell
 * the two apart, and reading every 403 as an expired session would sign a user
 * out for clicking something they may not do, so this matches on the body: an
 * error code first, which is the same in every language, then DRF's sentence.
 *
 * A `WWW-Authenticate` header on the 403 is deliberately not a signal. DRF
 * never sends one with a 403 (when an authenticator provides the header it
 * answers 401, which the built-in classifier reads), and an OAuth resource
 * server sends one with a 403 that means the opposite: `insufficient_scope`.
 */
export function anonymousForbidden(options: AnonymousForbiddenOptions = {}): ApiResponseClassifier {
  const { codes = DRF_ANONYMOUS_CODES, messages = DRF_ANONYMOUS_MESSAGES } = options
  return (context: ApiResponseContext) => {
    if (context.status !== 403 || !isRecord(context.body)) return null
    if (codesOf(context.body).some((code) => codes.includes(code))) return 'unauthenticated'

    const detail = context.body.detail
    if (typeof detail !== 'string') return null
    const matches = messages.some((message) =>
      typeof message === 'string' ? message === detail : message.test(detail),
    )
    return matches ? 'unauthenticated' : null
  }
}

/**
 * Django REST Framework's CSRF refusal: a 403 whose `detail` starts with
 * `CSRF Failed:`. The prefix is a literal in DRF, so it is the same in every
 * language.
 */
export const drfCsrfFailed: ApiResponseClassifier = (context) => {
  if (context.status !== 403 || !isRecord(context.body)) return null
  const detail = context.body.detail
  return typeof detail === 'string' && detail.startsWith('CSRF Failed') ? 'csrf' : null
}
