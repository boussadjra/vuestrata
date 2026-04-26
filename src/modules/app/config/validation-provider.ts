import { createValidator } from '~/lib/validation'
import { useValidationCacheState } from '~/state/validation-cache'
import { useAppStore } from '~/stores/app'
import type { ValidationAdapter } from '~/types'

export function useValidationProvider() {
  const appStore = useAppStore()
  const cache = useValidationCacheState()

  // Invalidate the active-adapter snapshot whenever the store's adapter
  // selection changes. The watcher is owned by the calling consumer's scope
  // so it tears down with the consumer and avoids cross-suite leaks.
  watch(
    () => appStore.validationAdapter,
    () => {
      cache.resetActive()
    },
  )

  async function getAdapter(): Promise<ValidationAdapter> {
    if (cache.activeAdapter.value && cache.activeAdapterName.value === appStore.validationAdapter) {
      return cache.activeAdapter.value
    }
    const next = await createValidator(appStore.validationAdapter)
    cache.setActive(next, appStore.validationAdapter)
    return next
  }

  return {
    adapterName: appStore.validationAdapter,
    setAdapter: appStore.setValidationAdapter.bind(appStore),
    getAdapter,
  }
}
