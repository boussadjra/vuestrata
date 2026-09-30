import { VueQueryPlugin, type VueQueryPluginOptions } from '@tanstack/vue-query'

import { queryRetryDelay, shouldRetryQuery } from '~/lib/api/retry'

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

export { VueQueryPlugin }
