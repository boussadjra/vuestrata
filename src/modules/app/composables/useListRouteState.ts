import type {
  QueryIssue,
  QueryModel,
  QueryModelValues,
  QueryNavigationMode,
  QueryParamDefinitions,
  QueryPatch,
  QueryStatus,
} from '@queryweave/core'
import { useQueryModel } from '@queryweave/vue'
import {
  computed,
  nextTick,
  onScopeDispose,
  ref,
  shallowRef,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue'

import type { ListQueryValues } from '~/lib/table-query'

export interface ListRouteState {
  values: ComputedRef<ListQueryValues>
  search: Ref<string>
  issues: ComputedRef<readonly QueryIssue[]>
  status: ComputedRef<QueryStatus>
  error: Ref<unknown>
  update: (patch: Record<string, unknown>, navigation?: QueryNavigationMode) => Promise<boolean>
  setSearch: (value: string) => void
}

/** Route-bound URL state. Features receive this typed port, never raw router state. */
export function useListRouteState<TDefs extends QueryParamDefinitions>(
  model: QueryModel<TDefs>,
): ListRouteState {
  const query = useQueryModel(model)
  const values = computed(() => query.values as unknown as ListQueryValues)
  const draft = ref(values.value.search)
  const error = shallowRef<unknown>(null)
  const timer = ref<ReturnType<typeof setTimeout> | undefined>()
  let generation = 0
  let draftVersion = 0
  const transitions = new Map<number, { version: number; target: string }>()

  function cancelSearch(): void {
    if (timer.value !== undefined) clearTimeout(timer.value)
    timer.value = undefined
  }

  watch(
    () => ({ ...query.values }),
    () => {
      // A slow earlier navigation must not replace newer typing or cancel its timer.
      const snapshot = JSON.stringify(model.encode(query.values))
      const owned = [...transitions.values()].find((transition) => transition.target === snapshot)
      if (owned && owned.version < draftVersion) return
      if (!owned) {
        // Back/Forward or another navigation supersedes pending typing.
        draftVersion++
        generation++
      }
      cancelSearch()
      draft.value = values.value.search
    },
  )

  async function commit(
    patch: Record<string, unknown>,
    navigation: QueryNavigationMode,
  ): Promise<boolean> {
    const request = ++generation
    const version = draftVersion
    error.value = null
    try {
      const target = model.normalize(
        model.encode({ ...query.values, ...patch } as QueryModelValues<TDefs>),
      )
      transitions.set(request, { version, target: JSON.stringify(target) })
      const result = await query.update(patch as QueryPatch<TDefs>, { navigation })
      // Observe the complete owned transition before dropping its identity.
      await nextTick()
      return result.outcome === 'committed' || result.outcome === 'unchanged'
    } catch (cause) {
      if (request === generation && version === draftVersion) error.value = cause
      return false
    } finally {
      transitions.delete(request)
      if (request === generation && version === draftVersion) draft.value = values.value.search
    }
  }

  function setSearch(value: string): void {
    cancelSearch()
    draftVersion++
    draft.value = value
    timer.value = setTimeout(() => {
      timer.value = undefined
      void commit({ search: value, page: 1 }, 'replace')
    }, 300)
  }

  async function update(
    patch: Record<string, unknown>,
    navigation: QueryNavigationMode = 'push',
  ): Promise<boolean> {
    cancelSearch()
    const pendingSearch = draft.value !== values.value.search
    return commit(pendingSearch ? { ...patch, search: draft.value, page: 1 } : patch, navigation)
  }

  onScopeDispose(() => {
    generation++
    draftVersion++
    cancelSearch()
  })

  return {
    values,
    search: computed({ get: () => draft.value, set: setSearch }),
    issues: computed(() => query.issues),
    status: computed(() => query.status),
    error,
    update,
    setSearch,
  }
}
