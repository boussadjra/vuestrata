import { getValidationCacheBackend } from '~/lib/runtime'
import type { ValidationAdapter, ValidationAdapterName } from '~/types'

/** Lazy adapter loaders — each returns a Promise that code-splits the adapter */
const adapterLoaders: Record<ValidationAdapterName, () => Promise<ValidationAdapter>> = {
  zod: () => import('./adapters/zod').then((m) => m.zodAdapter),
  valibot: () => import('./adapters/valibot').then((m) => m.valibotAdapter),
  yup: () => import('./adapters/yup').then((m) => m.yupAdapter),
  arktype: () => import('./adapters/arktype').then((m) => m.arktypeAdapter),
}

/** Lazy-load a validation adapter by name */
export async function createValidator(name: ValidationAdapterName): Promise<ValidationAdapter> {
  const cache = getValidationCacheBackend<ValidationAdapter>()
  const cached = cache.get(name)
  if (cached) return cached

  const loader = adapterLoaders[name] ?? adapterLoaders.zod
  const adapter = await loader()

  cache.set(name, adapter)
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
