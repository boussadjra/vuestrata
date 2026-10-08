/**
 * Where the app is served from on its origin, and the URLs built from that.
 *
 * An app mounted under a path prefix (`https://portal.example.com/console/`)
 * owns only the part of the origin below that prefix. Everything it asks the
 * browser for by URL has to carry it: its own files (`version.json`), the
 * address an identity provider sends the visitor back to, a link that leaves
 * the router. The router does this by itself, because its history is created
 * with the base. This module is for the URLs the router never sees.
 *
 * There is one source of truth: Vite's `base`, which the build sets from
 * `VUESTRATA_BASE_PATH` (`scripts/vite/vuestrata-plugin.mjs`) and which is
 * already in every asset URL of the bundle. `import.meta.env.BASE_URL` is that
 * value, and nothing here reads anything else.
 *
 * The API is NOT under the base: `VUESTRATA_API_URL=/api` is `/api` at the
 * root of the origin wherever the app is mounted. A backend that lives under
 * the prefix says so in that variable (`/console/api`).
 */
import { DEFAULT_BASE_PATH, describeBasePathIssue } from './env.schema'

/**
 * The path prefix the app is served under: `/`, or `/console/`. Always starts
 * and ends with `/`.
 *
 * A Vite `base` that is not a path on this origin (a relative `./`, the URL of
 * a CDN, both of which only a project's own Vite config can set) is not
 * something a URL can be built under, and reads as the root.
 */
export function appBasePath(): string {
  const base: unknown = import.meta.env.BASE_URL
  if (typeof base !== 'string') return DEFAULT_BASE_PATH
  const closed = base.endsWith('/') ? base : `${base}/`
  return describeBasePathIssue(closed) === null ? closed : DEFAULT_BASE_PATH
}

/** C0 controls and DEL, which a browser strips from a URL before reading it. */
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

/**
 * `path`, a path inside the app as the router writes one (`/auth/callback`),
 * as the path the browser asks the server for (`/console/auth/callback`).
 *
 * With the app at the root this returns the path as given. The leading slash
 * is optional (`version.json`), and the result never has two in a row where
 * the prefix meets the path.
 *
 * It takes a path and nothing else. A URL with a scheme, a protocol-relative
 * `//host/x` and anything with a backslash or a control character (which a
 * browser reads as one of the first two) throw: every caller passes a path it
 * wrote, so one of those is a bug, and prefixing it would hide where the URL
 * was going.
 */
export function appPath(path: string): string {
  if (
    typeof path !== 'string' ||
    /^[/\\]{2}/.test(path) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(path) ||
    path.includes('\\') ||
    hasControlCharacter(path)
  ) {
    throw new TypeError(`appPath() takes a path inside the app, received ${JSON.stringify(path)}.`)
  }
  return `${appBasePath()}${path.replace(/^\//, '')}`
}

/**
 * `path` as an absolute URL on the app's own origin, under the base:
 * `appUrl('/auth/callback')` is `https://portal.example.com/console/auth/callback`.
 *
 * For the URLs that are read somewhere else, where a path alone means nothing:
 * an OAuth `redirect_uri`, a link put in an e-mail. Same rules as `appPath`.
 */
export function appUrl(path: string): string {
  return `${globalThis.location.origin}${appPath(path)}`
}

/**
 * A pathname from the address bar (`/console/docs/intro`) as a path inside
 * the app (`/docs/intro`), which is what the router calls it.
 *
 * A pathname outside the base is returned as it is: the app is not served
 * there, so there is nothing to take off.
 */
export function stripAppBase(pathname: string): string {
  const base = appBasePath()
  if (base === DEFAULT_BASE_PATH) return pathname
  if (pathname === base.slice(0, -1)) return '/'
  return pathname.startsWith(base) ? pathname.slice(base.length - 1) : pathname
}

/**
 * The current location as a path inside the app, for code that runs before
 * the router exists (the first paint) or outside it. `/` where there is no
 * window.
 */
export function appPathname(): string {
  return typeof window === 'undefined' ? '/' : stripAppBase(window.location.pathname)
}
