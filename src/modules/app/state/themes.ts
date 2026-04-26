import type { ThemeConfig } from '~/types'

/**
 * Shared registry of runtime-registered themes. Built-in themes are static
 * constants in `theme.config.ts`; this state container only tracks the
 * dynamic additions registered via `registerTheme()`.
 */
export const useCustomThemes = createGlobalState(() => {
  const customThemes = ref<ThemeConfig[]>([])
  return { customThemes }
})
