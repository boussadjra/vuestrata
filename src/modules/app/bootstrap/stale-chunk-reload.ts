/**
 * Whether the page is about to be replaced by a stale-chunk reload.
 *
 * `plugins/stale-chunk.ts` reloads the page once when a route's chunk is
 * missing. `location.reload()` returns at once and the page keeps running until
 * the new document arrives, and whatever fails in between is about to be thrown
 * away with it: the navigation that hit the missing chunk rejects, and a boot
 * that was waiting on that navigation rejects too. An error screen for either
 * would flash a failure at a visitor who is one moment from the fix, and report
 * an error nobody has to act on. `boot()` and the error boundary ask here first
 * and hold their screen while a reload is on its way.
 *
 * This reads the marker the plugin already leaves in `sessionStorage`, and asks
 * the plugin for nothing. The plugin is the project's file and this one is
 * Vuestrata's: an upgrade replaces this one and leaves that one alone, so a
 * new export there would be missing from every existing project.
 */

/** The marker `plugins/stale-chunk.ts` writes: the time it asked for a reload. */
const RELOAD_MARKER_KEY = 'vuestrata-stale-chunk-reload'

/** What the marker held when this document started. */
const BASELINE_KEY = 'vuestrata-stale-chunk-reload-baseline'

/**
 * How long a requested reload is given to happen before the app stops waiting
 * for it. A reload normally lands well inside a second; this covers a slow
 * connection, and it is bounded because a reload can also be refused (a
 * `beforeunload` prompt the visitor cancels) and the app must not wait for ever.
 */
const RELOAD_GRACE_MS = 10_000

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * Record what the marker holds as the document starts. Called by `boot()`,
 * before anything can ask for a reload.
 *
 * The marker outlives the reload it records, so by itself it cannot say which
 * document asked: the one still running, or the one before it. A marker that
 * differs from this baseline was written by the document still running.
 *
 * In `sessionStorage` rather than a variable because it is per-document state
 * that module scope may not hold, and each boot overwrites it.
 */
export function noteStaleChunkReloadBaseline(): void {
  try {
    sessionStorage.setItem(BASELINE_KEY, read(RELOAD_MARKER_KEY) ?? '')
  } catch {
    // No storage: the plugin cannot record an attempt either, so it never
    // reloads, and there is never a reload to wait for.
  }
}

/**
 * Milliseconds left to wait for a reload this document has asked for, or `0`
 * when none is on its way.
 */
export function pendingStaleChunkReloadMs(): number {
  const marker = read(RELOAD_MARKER_KEY)
  // No marker, or the one the previous document left: its reload has happened,
  // and this is the page it came back to.
  if (!marker || marker === read(BASELINE_KEY)) return 0

  const requestedAt = Number(marker)
  if (!Number.isFinite(requestedAt)) return 0
  const waited = Date.now() - requestedAt
  // A clock that went backwards must not turn into an unbounded wait.
  if (waited < 0) return 0
  return Math.max(0, RELOAD_GRACE_MS - waited)
}
