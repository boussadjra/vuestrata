/**
 * Where the API is, as absolute URLs.
 *
 * `VUESTRATA_API_URL` may be a same-origin path such as `/api` (the app sits
 * behind a reverse proxy) or an absolute URL on another origin. The API client
 * needs it absolute, and so does anything that has to name an address beside
 * the API rather than under it: a framework's own login route, which Laravel
 * serves at `/login` while the API lives under `/api`.
 *
 * Read through the validated env boundary (`core/lib/config`) rather than
 * `import.meta.env` directly, so there is one place that decides what a valid
 * API URL is.
 */
import { runtimeEnv } from '~/lib/config'

/**
 * The page's origin, or `http://localhost` where there is no page (Node, a
 * worker): a relative base breaks URL resolution inside ofetch, because
 * `new URL` requires an absolute one.
 */
function pageOrigin(): string {
  return typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'http://localhost'
}

/** `apiUrl` as an absolute URL: as it is when it names an origin, else under the page's. */
export function resolveApiBaseUrl(apiUrl: unknown): string {
  try {
    if (typeof apiUrl !== 'string') return String(apiUrl)
    if (!apiUrl.startsWith('/')) return apiUrl
    return `${pageOrigin().replace(/\/+$/, '')}${apiUrl}`
  } catch {
    // Fall back to the raw value if anything unexpected happens.
    return String(apiUrl)
  }
}

/**
 * The API base URL every request path is resolved against. Resolved once, when
 * this module is evaluated, like `runtimeEnv` itself.
 */
export const apiBaseUrl: string = resolveApiBaseUrl(runtimeEnv.apiUrl)

/**
 * A root-relative path as an absolute URL on the API's ORIGIN, whatever path
 * the API itself lives under: `/login` is `https://api.example.test/login` for
 * an API at `https://api.example.test/api`, and the page's own `/login` for an
 * API at `/api`.
 *
 * The API client treats the result as the API (the same origin is what it
 * goes by), so the request carries the session: cookies, the CSRF header and
 * whatever `api.overrides.ts` adds. A base URL that cannot be parsed gives the
 * path back, which then resolves under the base like any other.
 */
export function apiOriginUrl(path: string, base: string = apiBaseUrl): string {
  try {
    return `${new URL(base).origin}${path.startsWith('/') ? path : `/${path}`}`
  } catch {
    return path
  }
}
