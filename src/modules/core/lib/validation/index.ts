import { getValidationCacheBackend } from '~/lib/runtime'
import type { ValidationAdapter, ValidationAdapterName } from '~/types'

const ZOD_ADAPTER_NAME: ValidationAdapterName = 'zod'

/** Lazy-load the repo's single supported validation adapter (Zod). */
export async function createValidator(
  _name: ValidationAdapterName = ZOD_ADAPTER_NAME,
): Promise<ValidationAdapter> {
  const cache = getValidationCacheBackend<ValidationAdapter>()
  const cached = cache.get(ZOD_ADAPTER_NAME)
  if (cached) return cached

  const adapter = await import('./adapters/zod').then((m) => m.zodAdapter)

  cache.set(ZOD_ADAPTER_NAME, adapter)
  return adapter
}

/**
 * Drop cached adapters. Tests that swap the active adapter between cases
 * must call this so they don't observe results from a previous suite.
 */
export function clearValidatorCache(name?: ValidationAdapterName): void {
  const cache = getValidationCacheBackend<ValidationAdapter>()
  if (name) cache.delete(name)
  else cache.clear()
}

export { zodAdapter } from './adapters/zod'
export type { ValidationAdapter, ValidationResult, FieldError } from '~/types'
