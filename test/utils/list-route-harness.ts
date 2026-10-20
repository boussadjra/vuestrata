import type { QueryModel, QueryParamDefinitions } from '@queryweave/core'
import { createMemoryQueryAdapter } from '@queryweave/testing'
import { queryAdapterKey } from '@queryweave/vue'
import { defineComponent, h, onScopeDispose, type Component } from 'vue'

import { useListRouteState } from '@/composables/useListRouteState'

/** Exercise a feature's typed URL port without introducing a Vue Router dependency. */
export function listRouteHarness<TDefs extends QueryParamDefinitions>(
  component: Component,
  model: QueryModel<TDefs>,
) {
  const adapter = createMemoryQueryAdapter()
  const host = defineComponent({
    setup() {
      const queryState = useListRouteState(model)
      onScopeDispose(() => adapter.dispose())
      return () => h(component, { queryState })
    },
  })
  return { host, provide: { [queryAdapterKey as symbol]: adapter } }
}
