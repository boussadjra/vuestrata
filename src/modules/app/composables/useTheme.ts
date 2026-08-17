import { useActivePathname } from '@/composables/useActiveLocale'
import { applyAppearance, resolveActiveLocale, type SupportedLocale } from '@/plugins/appearance'
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
 * Locale goes through `resolveActiveLocale()` so `/docs` stays English/LTR
 * without writing the stored preference. The DOM is mutated through
 * `applyAppearance()` — the same helper used by the pre-mount bootstrap.
 */
export function useThemeSync() {
  const appStore = useAppStore()
  const pathname = useActivePathname()

  const stop = watchEffect(() => {
    const config = getTheme(appStore.theme)
    applyAppearance({
      theme: appStore.theme,
      themeClass: config?.cssClass ?? '',
      dark: appStore.isDark,
      locale: resolveActiveLocale(pathname.value, appStore.locale as SupportedLocale),
    })
  })

  // When invoked from a setup() (the documented usage in App.vue) the active
  // effect scope owns disposal; the explicit hook makes the contract robust
  // if a caller ever reuses this composable from a non-component scope.
  if (getCurrentScope()) onScopeDispose(stop)
  return stop
}
