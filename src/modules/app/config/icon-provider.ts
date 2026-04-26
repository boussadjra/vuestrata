import { lucideIconMap } from '~/icons/maps/lucide'
import { phosphorIconMap } from '~/icons/maps/phosphor'
import { solarIconMap } from '~/icons/maps/solar'
import { useCustomIconMaps } from '~/state/icon-maps'
import { useAppStore } from '~/stores/app'
import type { IconName, IconMap } from '~/types'

const builtinMaps: Record<string, IconMap> = {
  solar: solarIconMap,
  lucide: lucideIconMap,
  phosphor: phosphorIconMap,
}

export function useIconProvider() {
  const appStore = useAppStore()
  return {
    provider: appStore.iconProvider,
    setProvider: appStore.setIconProvider.bind(appStore),
  }
}

/** Register a custom icon map at runtime */
export function registerIconMap(name: string, map: IconMap): void {
  const { customMaps } = useCustomIconMaps()
  customMaps.value.set(name, map)
}

/** Resolve a semantic icon name to its CSS class based on the active provider */
export function resolveIcon(name: IconName): string {
  const appStore = useAppStore()
  const { customMaps } = useCustomIconMaps()
  const p = appStore.iconProvider
  const map = customMaps.value.get(p) ?? builtinMaps[p] ?? builtinMaps.solar!
  return map[name] ?? ''
}

const DEFAULT_ICON: IconName = 'widget'

/** Resolve an untrusted icon string with a fallback for invalid names */
export function safeResolveIcon(name: string | undefined): string {
  if (!name) return resolveIcon(DEFAULT_ICON)
  const appStore = useAppStore()
  const { customMaps } = useCustomIconMaps()
  const p = appStore.iconProvider
  const map = customMaps.value.get(p) ?? builtinMaps[p] ?? builtinMaps.solar!
  return map[name as IconName] || resolveIcon(DEFAULT_ICON)
}

/** Get all available icon provider names */
export function getIconProviders(): string[] {
  const { customMaps } = useCustomIconMaps()
  return [...Object.keys(builtinMaps), ...customMaps.value.keys()]
}
