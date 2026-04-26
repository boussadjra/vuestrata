import type { ValidationAdapter, ValidationAdapterName } from '~/types'

/**
 * Shared lazy cache for validation adapters. Wrapped in `createGlobalState`
 * so the cache map and the cached active-adapter snapshot are not module-scope
 * mutable state.
 *
 * The cell-style holders avoid recreating the wrapping ref/identity when the
 * cache is mutated — consumers read/write through the methods.
 */
export const useValidationCacheState = createGlobalState(() => {
  const cache = new Map<string, ValidationAdapter>()
  const activeAdapter = ref<ValidationAdapter | null>(null)
  const activeAdapterName = ref<ValidationAdapterName | null>(null)

  function get(name: string): ValidationAdapter | undefined {
    return cache.get(name)
  }
  function set(name: string, value: ValidationAdapter): void {
    cache.set(name, value)
  }
  function deleteEntry(name: string): void {
    cache.delete(name)
  }
  function clear(): void {
    cache.clear()
  }
  function setActive(adapter: ValidationAdapter | null, name: ValidationAdapterName | null): void {
    activeAdapter.value = adapter
    activeAdapterName.value = name
  }
  function resetActive(): void {
    activeAdapter.value = null
    activeAdapterName.value = null
  }

  return {
    get,
    set,
    delete: deleteEntry,
    clear,
    activeAdapter,
    activeAdapterName,
    setActive,
    resetActive,
  }
})
