import { griddyIconMap } from '~/icons/maps/griddy'
import { iconamoonIconMap } from '~/icons/maps/iconamoon'
import { iconoirIconMap } from '~/icons/maps/iconoir'
import { lucideIconMap } from '~/icons/maps/lucide'
import { mingcuteIconMap } from '~/icons/maps/mingcute'
import { phosphorIconMap } from '~/icons/maps/phosphor'
import { remixIconMap } from '~/icons/maps/remix'
import { solarIconMap } from '~/icons/maps/solar'
import { tablerIconMap } from '~/icons/maps/tabler'
import { useCustomIconMaps } from '~/state/icon-maps'
import { useAppStore } from '~/stores/app'
import type { IconName, IconMap } from '~/types'

const DEFAULT_ICON: IconName = 'widget'

const builtinMaps: Record<string, IconMap> = {
  solar: solarIconMap,
  lucide: lucideIconMap,
  phosphor: phosphorIconMap,
  iconoir: iconoirIconMap,
  tabler: tablerIconMap,
  mingcute: mingcuteIconMap,
  remix: remixIconMap,
  griddy: griddyIconMap,
  iconamoon: iconamoonIconMap,
}

function lookupIcon(map: IconMap, name: IconName): string {
  const cls = map[name]
  if (cls) return cls
  return map[DEFAULT_ICON] ?? ''
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
  return lookupIcon(map, name)
}

/** Resolve an untrusted icon string with a fallback for invalid names */
export function safeResolveIcon(name: string | undefined): string {
  if (!name) return resolveIcon(DEFAULT_ICON)
  const appStore = useAppStore()
  const { customMaps } = useCustomIconMaps()
  const p = appStore.iconProvider
  const map = customMaps.value.get(p) ?? builtinMaps[p] ?? builtinMaps.solar!
  const cls = map[name as IconName]
  if (cls) return cls
  return resolveIcon(DEFAULT_ICON)
}

/** Get all available icon provider names */
export function getIconProviders(): string[] {
  const { customMaps } = useCustomIconMaps()
  return [...Object.keys(builtinMaps), ...customMaps.value.keys()]
}
