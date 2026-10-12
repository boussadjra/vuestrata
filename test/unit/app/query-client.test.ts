import { QueryClient, useQueryClient, type VueQueryPluginOptions } from '@tanstack/vue-query'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { createApp } from 'vue'

import {
  clearQueryCacheOnSessionEnd,
  VueQueryPlugin,
  vueQueryOptions,
} from '@/bootstrap/query-client'
import * as legacy from '@/plugins/vue-query'
import { useAuthStore } from '@/stores/auth'
import { queryRetryDelay, shouldRetryQuery } from '~/lib/api/retry'
import { installErrorReporter, resetErrorReporter } from '~/lib/errors'
import { appEvents } from '~/lib/events'

import { createUser } from '../../fixtures'

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

/**
 * The previous user's data must not outlive their session.
 *
 * Nothing used to clear TanStack's cache on logout or expiry, so whoever signed
 * in next on the same tab was shown the last person's lists until the refetches
 * landed.
 */
describe('when the session ends', () => {
  const ORDERS = ['orders', 'list']

  function reporter() {
    const installed = { name: 'test', captureException: vi.fn(), setUser: vi.fn() }
    installErrorReporter(installed)
    return installed
  }

  /** An app with the plugin installed the way `boot()` installs it. */
  function bootedApp(options: VueQueryPluginOptions = vueQueryOptions) {
    const app = createApp({ render: () => null })
    app.use(VueQueryPlugin, options)
    const queryClient = app.runWithContext(() => useQueryClient())
    app.mount(document.createElement('div'))
    return { app, queryClient }
  }

  afterEach(() => {
    resetErrorReporter()
    appEvents.clear('auth.logout')
  })

  it.each(['logout', 'expired'] as const)(
    'drops the query cache and the reporter user on %s',
    (reason) => {
      const { app, queryClient } = bootedApp()
      const errors = reporter()
      queryClient.setQueryData(ORDERS, [{ id: 1, customer: 'the previous user’s' }])

      useAuthStore().setAuth(createUser(), 'access-token')
      useAuthStore().clearAuth(reason)

      expect(queryClient.getQueryData(ORDERS)).toBeUndefined()
      expect(queryClient.getQueryCache().getAll()).toEqual([])
      expect(errors.setUser).toHaveBeenCalledExactlyOnceWith(null)
      app.unmount()
    },
  )

  it('clears the client a project passed in, not one of its own', () => {
    const queryClient = new QueryClient()
    const { app } = bootedApp({ queryClient })
    queryClient.setQueryData(ORDERS, [{ id: 1 }])

    appEvents.emit('auth.logout', {})

    expect(queryClient.getQueryData(ORDERS)).toBeUndefined()
    app.unmount()
  })

  it('leaves the cache alone while the session lasts', () => {
    const { app, queryClient } = bootedApp()
    queryClient.setQueryData(ORDERS, [{ id: 1 }])

    useAuthStore().setAuth(createUser(), 'access-token')
    useAuthStore().setUser(createUser())

    expect(queryClient.getQueryData(ORDERS)).toEqual([{ id: 1 }])
    app.unmount()
  })

  it('stops listening when the app is unmounted', () => {
    const { app, queryClient } = bootedApp()
    const errors = reporter()

    app.unmount()
    queryClient.setQueryData(ORDERS, [{ id: 1 }])
    appEvents.emit('auth.logout', { reason: 'logout' })

    // The subscription belonged to the app; nothing at module scope kept it.
    expect(queryClient.getQueryData(ORDERS)).toEqual([{ id: 1 }])
    expect(errors.setUser).not.toHaveBeenCalled()
  })

  it('can be subscribed by hand, and returns the way out', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(ORDERS, [{ id: 1 }])

    const stop = clearQueryCacheOnSessionEnd(queryClient)
    stop()
    appEvents.emit('auth.logout', {})

    expect(queryClient.getQueryData(ORDERS)).toEqual([{ id: 1 }])
  })
})
