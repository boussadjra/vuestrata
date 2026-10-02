/**
 * Where to go after signing in, given the `redirect` query parameter.
 *
 * The parameter is written by the app (the route guard and the session-expiry
 * redirect put the page the visitor was on there) but it arrives in a URL, so
 * anybody can write one: a link to `/auth/login?redirect=//evil.example` would
 * otherwise send somebody who has just typed their password to another site.
 *
 * Only an in-app path is accepted, and anything else gets `fallback`:
 *
 * - it must be a string starting with a single `/`. `//host` and `/\host` are
 *   protocol-relative URLs to a browser, and anything with a scheme
 *   (`https:`, `javascript:`) does not start with `/` at all. A same-origin
 *   absolute URL is refused too: nothing in the app produces one.
 * - no backslash anywhere, since browsers read `\` as `/` in a URL;
 * - no ASCII control character. Browsers strip TAB, LF and CR from a URL
 *   before parsing it, so `/<TAB>/host` is `//host` by the time it navigates;
 * - and the same again once percent-decoded, so `/%5Chost` and `/%09/host` do
 *   not get through encoded. A value that does not decode is refused.
 *
 * vue-router keeps a path it is pushed on the current origin, so these were
 * not exploitable through `router.push`. The check does not depend on that:
 * the value it returns is safe to hand to `location.assign` as well.
 */
export function safeRedirectPath(raw: unknown, fallback = '/dashboard'): string {
  if (typeof raw !== 'string' || !isInAppPath(raw)) return fallback
  try {
    return isInAppPath(decodeURIComponent(raw)) ? raw : fallback
  } catch {
    return fallback
  }
}

function isInAppPath(value: string): boolean {
  return (
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !hasControlCharacter(value)
  )
}

/** C0 controls and DEL. A loop rather than a pattern full of escapes. */
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}
