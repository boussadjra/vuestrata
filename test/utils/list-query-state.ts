import type { QueryModel, QueryParamDefinitions } from '@queryweave/core'
import { createMemoryQueryAdapter, type MemoryQueryAdapterOptions } from '@queryweave/testing'
import { queryAdapterKey } from '@queryweave/vue'
import { createApp, effectScope } from 'vue'

import { useListRouteState } from '@/composables/useListRouteState'

/** Exercise production QueryWeave binding with deterministic history and guards. */
export function createListStateFixture<T extends QueryParamDefinitions>(
  model: QueryModel<T>,
  options: MemoryQueryAdapterOptions = {},
) {
  const adapter = createMemoryQueryAdapter(options)
  const app = createApp({})
  app.provide(queryAdapterKey, adapter)
  const scope = effectScope()
  const queryState = scope.run(() => app.runWithContext(() => useListRouteState(model)))!
  return {
    queryState,
    adapter,
    run: <TResult>(fn: () => TResult) => scope.run(fn)!,
    dispose: () => {
      scope.stop()
      adapter.dispose()
    },
  }
}
