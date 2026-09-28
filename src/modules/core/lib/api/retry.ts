/**
 * The retry policy for server state.
 *
 * There is exactly one retry layer, and it is TanStack Query's: the HTTP
 * client makes a single attempt per call (`retry: 0` in `client.ts`). Two
 * layers used to stack — ofetch's three retries under TanStack's one — so a
 * query against a dead backend made up to eight requests, in lockstep across
 * every open tab, at the moment the backend could least afford them.
 *
 * Framework-agnostic on purpose. These are plain functions with the shape
 * TanStack's `retry` and `retryDelay` options take, wired up in
 * `app/plugins/vue-query.ts`, so the policy is testable without a query client.
 */
import { toAppError } from './failure'

/** Retries after the first attempt: a failing query makes at most three requests. */
const MAX_QUERY_RETRIES = 2

const BASE_DELAY_MS = 1_000
const MAX_BACKOFF_MS = 30_000

/**
 * Whether TanStack should run a failed query again. `failureCount` is
 * TanStack's: 0 on the first failure.
 *
 * Only a failure the error itself marks retryable qualifies — the network, a
 * timeout, 408/425/429 and 5xx (see `AppError.retryable`). Any other 4xx is an
 * answer, and asking again gets the same one: retrying a 404 only delays the
 * not-found page. A contract mismatch, an abort and an unclassified error are
 * never retried.
 *
 * Mutations do not use this: a write is not safe to repeat blindly, and
 * `vue-query.ts` gives them no retries at all.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_QUERY_RETRIES && toAppError(error).retryable === true
}

/**
 * How long TanStack waits before retry number `attempt + 1` (`attempt` is
 * TanStack's failure count, 0 on the first failure).
 *
 * Exponential backoff — 1 s, 2 s, 4 s … up to 30 s — with jitter across the
 * upper half of each step, so tabs that failed together do not retry together.
 * A `Retry-After` from the server raises the floor: the retry never comes
 * earlier than the server asked (within the cap `parseRetryAfter` applies).
 */
export function queryRetryDelay(attempt: number, error: unknown): number {
  const ceiling = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_BACKOFF_MS)
  const floor = Math.max(ceiling / 2, toAppError(error).retryAfterMs ?? 0)
  return Math.round(floor + Math.random() * (ceiling / 2))
}
