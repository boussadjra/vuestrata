import type { IconMap } from '~/types'

/**
 * Shared registry of runtime-registered icon maps (keyed by provider name).
 * Built-in maps are static constants in `icon-provider.ts`; this state
 * container only tracks the dynamic additions registered via
 * `registerIconMap()`.
 */
export const useCustomIconMaps = createGlobalState(() => {
  const customMaps = ref(new Map<string, IconMap>())
  return { customMaps }
})
