import { applyAppearance, type SupportedLocale } from '@/plugins/appearance'
import { useAppStore } from '@/stores/app'
import { getThemes, getTheme, registerTheme as registryRegisterTheme } from '~/config/theme.config'
import type { ThemeName, ThemeConfig } from '~/types'

/**
 * Reactive theme composable. Reads theme and dark mode from the app store
 * and exposes helpers for theme control.
 */
export function useTheme() {
  const appStore = useAppStore()

  const themes = computed<ThemeConfig[]>(() => getThemes())
  const currentThemeName = computed(() => appStore.theme)
  const currentTheme = computed(() => getTheme(appStore.theme) ?? getThemes()[0]!)

  function setTheme(name: ThemeName) {
    appStore.setTheme(name)
  }

  function toggleDark() {
    appStore.toggleDark()
  }

  function registerTheme(config: ThemeConfig) {
    registryRegisterTheme(config)
  }

  return {
    currentTheme,
    currentThemeName,
    isDark: computed({
      get: () => appStore.isDark,
      set: (v) => {
        appStore.isDark = v
      },
    }),
    themes,
    setTheme,
    toggleDark,
    registerTheme,
  }
}

/**
 * Synchronizes the persisted appearance state (theme, dark mode, locale) to
 * `<html>`. Call from the app root so the watcher follows component lifecycle.
 *
 * The DOM is mutated through `applyAppearance()` from `@/plugins/appearance`
 * — the same helper used by the pre-mount bootstrap — so there is exactly one
 * place that owns these mutations.
 */
export function useThemeSync() {
  const appStore = useAppStore()

  const stop = watchEffect(() => {
    const config = getTheme(appStore.theme)
    applyAppearance({
      theme: appStore.theme,
      themeClass: config?.cssClass ?? '',
      dark: appStore.isDark,
      locale: appStore.locale as SupportedLocale,
    })
  })

  // When invoked from a setup() (the documented usage in App.vue) the active
  // effect scope owns disposal; the explicit hook makes the contract robust
  // if a caller ever reuses this composable from a non-component scope.
  if (getCurrentScope()) onScopeDispose(stop)
  return stop
}
