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
   * Also treat a redirect that ended on an HTML page, for a request that asked
   * for JSON, as a login redirect, whatever its path. On by default: an API
   * that redirects a JSON request to a web page is sending the browser
   * somewhere to sign in far more often than anywhere else.
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
 * Only a response `fetch` reached through a redirect qualifies. An HTML page
 * served directly at an API URL is a misrouted request (a static host's SPA
 * fallback answering `/api`), not an expired session, and the client reports
 * that as `UNEXPECTED_RESPONSE` instead of signing the user out.
 *
 * It cannot see a redirect to another origin (an identity provider): the
 * browser blocks that response for CORS, and it arrives as a network error.
 */
export function loginRedirect(options: LoginRedirectOptions = {}): ApiResponseClassifier {
  const { loginPath = DEFAULT_LOGIN_PATH, html = true } = options
  return (context) => {
    if (!context.redirected) return null
    if (loginPath.test(pathOf(context.responseUrl))) return 'unauthenticated'
    if (html && context.expectsJson && context.contentType === 'text/html') return 'unauthenticated'
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
   * Defaults to DRF's English message. DRF translates it when a locale is
   * active, so a backend that answers in the user's language needs its own
   * entries here, or a code.
   */
  messages?: readonly (string | RegExp)[]
}

const DRF_ANONYMOUS_CODES = ['not_authenticated', 'authentication_failed']
const DRF_ANONYMOUS_MESSAGES = ['Authentication credentials were not provided.']

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
 * out for clicking something they may not do, so this matches on the body.
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
