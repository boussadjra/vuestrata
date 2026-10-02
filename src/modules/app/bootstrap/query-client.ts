import {
  VueQueryPlugin as TanstackVueQueryPlugin,
  useQueryClient,
  type QueryClient,
  type VueQueryPluginOptions,
} from '@tanstack/vue-query'
import type { Plugin } from 'vue'

import { queryRetryDelay, shouldRetryQuery } from '~/lib/api/retry'
import { setErrorReporterUser } from '~/lib/errors'
import { appEvents } from '~/lib/events'

/**
 * The options `boot()` installs `VueQueryPlugin` with.
 *
 * Lives here, in the managed bootstrap, so a fix to a retry rule reaches every
 * project. `plugins/vue-query.ts` re-exports it under its old name.
 */
export const vueQueryOptions: VueQueryPluginOptions = {
  queryClientConfig: {
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        // The only retry layer — the API client makes one attempt per call.
        // At most two retries, only for failures that can clear (network,
        // timeout, 408/425/429, 5xx), with jittered backoff that waits at
        // least as long as a `Retry-After` asks. A 404 is not retried, so the
        // not-found page appears at once. See core/lib/api/retry.ts.
        retry: shouldRetryQuery,
        retryDelay: queryRetryDelay,
        refetchOnWindowFocus: true,
      },
      mutations: {
        // A write is not safe to repeat blindly: a retried POST can create the
        // record twice. A mutation that knows it is idempotent can opt in with
        // its own `retry`, and then gets the same backoff as queries.
        retry: false,
        retryDelay: queryRetryDelay,
      },
    },
  },
}

/**
 * Forget the signed-in user's data when the session ends.
 *
 * TanStack's cache outlives a logout: a second person signing in on the same
 * tab would be shown the first one's lists until the refetches landed, and the
 * error reporter would keep attributing errors to someone who has left. Both
 * are dropped on `auth.logout`, which the auth store's `clearAuth` emits for
 * a sign-out and an expiry alike.
 *
 * Returns the unsubscribe function. The subscription belongs to whatever
 * created `queryClient`, so it is released with it — see `VueQueryPlugin`.
 */
export function clearQueryCacheOnSessionEnd(queryClient: QueryClient): () => void {
  return appEvents.on('auth.logout', () => {
    queryClient.clear()
    setErrorReporterUser(null)
  })
}

/**
 * TanStack's `VueQueryPlugin`, plus the session-end reset above.
 *
 * It wraps rather than replaces so `boot()` and a project's own
 * `app.use(VueQueryPlugin, options)` (`plugins/vue-query.ts` re-exports this
 * name) get it without changing a line.
 */
export const VueQueryPlugin: Plugin<[VueQueryPluginOptions?]> = {
  install(app, options) {
    app.use(TanstackVueQueryPlugin, options)
    const queryClient = app.runWithContext(() => useQueryClient(options?.queryClientKey))
    app.onUnmount(clearQueryCacheOnSessionEnd(queryClient))
  },
}
