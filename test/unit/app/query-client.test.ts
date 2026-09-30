import { QueryClient } from '@tanstack/vue-query'
import { describe, expect, it } from 'vite-plus/test'

import { VueQueryPlugin, vueQueryOptions } from '@/bootstrap/query-client'
import * as legacy from '@/plugins/vue-query'
import { queryRetryDelay, shouldRetryQuery } from '~/lib/api/retry'

/**
 * The options `boot()` installs the query plugin with.
 *
 * They moved from `plugins/vue-query.ts` into the managed bootstrap so a fix to
 * a retry rule reaches every project. The retry policy itself is tested with
 * the classifier in `test/unit/lib/api-retry.test.ts`; this pins that the
 * bootstrap actually wires it, and that the old import path still works.
 */

function defaults() {
  if (!('queryClientConfig' in vueQueryOptions) || !vueQueryOptions.queryClientConfig) {
    throw new Error('vueQueryOptions no longer configures the query client')
  }
  return vueQueryOptions.queryClientConfig.defaultOptions
}

describe('query client options', () => {
  it('retries queries through the shared policy and never retries mutations', () => {
    expect(defaults()?.queries?.retry).toBe(shouldRetryQuery)
    expect(defaults()?.queries?.retryDelay).toBe(queryRetryDelay)
    expect(defaults()?.mutations?.retry).toBe(false)
    expect(defaults()?.mutations?.retryDelay).toBe(queryRetryDelay)
  })

  it('keeps data fresh for 30 seconds and cached for five minutes', () => {
    expect(defaults()?.queries?.staleTime).toBe(30_000)
    expect(defaults()?.queries?.gcTime).toBe(5 * 60_000)
  })

  it('builds a client that carries those defaults', () => {
    const config = 'queryClientConfig' in vueQueryOptions ? vueQueryOptions.queryClientConfig : null
    const client = new QueryClient(config ?? undefined)

    expect(client.getDefaultOptions().queries?.retry).toBe(shouldRetryQuery)
    expect(client.getDefaultOptions().mutations?.retry).toBe(false)
  })

  it('is still importable from plugins/vue-query, as projects import it', () => {
    expect(legacy.vueQueryOptions).toBe(vueQueryOptions)
    expect(legacy.VueQueryPlugin).toBe(VueQueryPlugin)
  })
})
