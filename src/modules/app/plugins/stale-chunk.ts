/**
 * Recovery from a deploy that happened while the app was open.
 *
 * Route components are lazy chunks with content-hashed filenames. When a new
 * version ships, the old filenames stop existing — so a tab that has been open
 * across the deploy asks for `about-a1b2c3d4.js`, gets a 404 (or the SPA
 * fallback's `index.html`, which fails to parse as a module), and the dynamic
 * import rejects.
 *
 * Before this, `router.onError` only called `NProgress.done()`. The navigation
 * was abandoned with the progress bar tidied away and nothing else happened:
 * the user clicked a link and the app silently did not move. Clicking again
 * failed the same way, because the missing chunk is missing permanently. The
 * only escape was a manual reload, which is exactly the fix the app should
 * have performed itself.
 *
 * Reloading is safe here in a way it generally is not: the chunk is gone from
 * the server, so there is no state in which retrying the import could succeed.
 *
 * The guard against reload loops is the important part. If a reload does NOT
 * fix the problem — a genuinely broken deploy, an asset host serving 500s, an
 * offline device — an unguarded handler turns one failed navigation into an
 * infinite refresh cycle that pins the CPU and makes the app impossible to
 * close gracefully. One attempt per session, then we surface the error.
 */
import { createScopedLogger } from '~/lib/logger'

const staleChunkLogger = createScopedLogger('stale-chunk')

/**
 * Marks that a reload has already been attempted. `sessionStorage` rather than
 * a module variable, because the reload destroys module state — a module-level
 * flag would be reset by the very reload it is meant to be counting.
 */
const RELOAD_MARKER_KEY = 'vuestrata-stale-chunk-reload'

/**
 * How long the marker suppresses a second reload. Long enough to break a loop,
 * short enough that a user who hits a genuine stale chunk again hours later in
 * the same tab still gets the automatic fix.
 */
const RELOAD_SUPPRESSION_MS = 30_000

/**
 * Messages browsers use when a dynamic import fails to load or parse.
 *
 * There is no error code and no shared error type for this across engines, so
 * message matching is the only option. Each entry is the substring one engine
 * uses:
 *   - Chromium: "Failed to fetch dynamically imported module"
 *   - Firefox:  "error loading dynamically imported module"
 *   - Safari:   "Importing a module script failed"
 *   - all:      "Unable to preload CSS" / a `<link rel=modulepreload>` failure
 *
 * The `Unexpected token '<'` case is the SPA fallback returning `index.html`
 * for a missing asset — the request "succeeds" with HTML that then fails to
 * parse as JavaScript.
 */
const STALE_CHUNK_PATTERNS = [
  'failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'importing a module script failed',
  'unable to preload css',
  "unexpected token '<'",
] as const

/**
 * Whether an error looks like a chunk that no longer exists on the server.
 *
 * Exported for tests: the patterns above are the fragile part of this module
 * and deserve to be pinned rather than trusted.
 */
export function isStaleChunkError(error: unknown): boolean {
  const normalized = messageOf(error).toLowerCase()
  return STALE_CHUNK_PATTERNS.some((pattern) => normalized.includes(pattern))
}

/**
 * Best-effort message text from an unknown throwable.
 *
 * Anything that is neither an Error nor a string yields '' rather than being
 * coerced: `String({})` is '[object Object]', which matches no pattern and is
 * only useful for producing confusing logs.
 */
function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error as { message: unknown }
    return typeof message === 'string' ? message : ''
  }
  return ''
}

/** True when a reload was already attempted recently enough to still count. */
function reloadAlreadyAttempted(): boolean {
  try {
    const raw = sessionStorage.getItem(RELOAD_MARKER_KEY)
    if (!raw) return false
    const at = Number(raw)
    if (!Number.isFinite(at)) return false
    return Date.now() - at < RELOAD_SUPPRESSION_MS
  } catch {
    // Storage unavailable: fail CLOSED and refuse to reload. An unguarded
    // reload loop is far worse than a navigation the user has to retry.
    return true
  }
}

function markReloadAttempted(): void {
  try {
    sessionStorage.setItem(RELOAD_MARKER_KEY, String(Date.now()))
  } catch {
    // If we cannot record the attempt we must not reload — see above.
  }
}

/**
 * Handle a possible stale-chunk error.
 *
 * Returns true when a reload was triggered, so callers can stop treating the
 * error as something to report. `reload` is injectable for tests, which must
 * not navigate the jsdom window.
 */
export function handleStaleChunkError(
  error: unknown,
  reload: () => void = () => window.location.reload(),
): boolean {
  if (!isStaleChunkError(error)) return false

  if (reloadAlreadyAttempted()) {
    staleChunkLogger.error(
      'A chunk failed to load again after a reload. Not reloading a second time — ' +
        'this is a broken deployment or an unreachable asset host, not a stale tab.',
      { err: error },
    )
    return false
  }

  staleChunkLogger.warn(
    'A route chunk is missing, which usually means a new version was deployed while this tab ' +
      'was open. Reloading once to pick it up.',
    { err: error },
  )
  markReloadAttempted()
  reload()
  return true
}

/**
 * Listen for Vite's own preload failures.
 *
 * `vite:preloadError` fires when a `modulepreload` for a route chunk fails,
 * which typically happens BEFORE the navigation itself does — catching it here
 * recovers a beat earlier than `router.onError` would. Calling
 * `preventDefault()` stops Vite rethrowing it as an unhandled rejection after
 * we have already decided to reload.
 */
export function installStaleChunkRecovery(): void {
  if (typeof window === 'undefined') return

  window.addEventListener('vite:preloadError', (event) => {
    const payload = (event as Event & { payload?: unknown }).payload
    if (handleStaleChunkError(payload)) {
      event.preventDefault()
    }
  })
}

/**
 * Clear the marker once the app has demonstrably recovered.
 *
 * Called after the first successful navigation: at that point chunks are
 * loading again, so a later stale chunk (a second deploy in the same session)
 * should be allowed its own reload rather than being suppressed by an old
 * marker.
 */
export function clearStaleChunkMarker(): void {
  try {
    sessionStorage.removeItem(RELOAD_MARKER_KEY)
  } catch {
    // Nothing to clear.
  }
}
