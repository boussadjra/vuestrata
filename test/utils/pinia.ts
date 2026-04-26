import { createPinia, setActivePinia, type Pinia } from 'pinia'

/**
 * Create and activate a fresh Pinia instance for testing.
 * Returns the Pinia instance.
 */
export function createTestPinia(): Pinia {
  const pinia = createPinia()
  setActivePinia(pinia)
  return pinia
}
