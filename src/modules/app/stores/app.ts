import { defineStore } from 'pinia'

import { useAppStorage } from '~/composables/useAppStorage'
import { createScopedLogger } from '~/lib/logger'
import {
  APPEARANCE_KEYS,
  SUPPORTED_LOCALES,
  applyAppearance,
  type SupportedLocale,
} from '~/plugins/appearance'
import type { ThemeName, IconProvider } from '~/types'

const appStoreLogger = createScopedLogger('app-store')

const ICON_PROVIDERS: IconProvider[] = ['solar', 'lucide', 'phosphor']

function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

function isAllowed<T extends string>(allowed: readonly T[]) {
  return (value: T) => allowed.includes(value)
}

function prefersCollapsedSidebarByViewport(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(max-width: 1023px)').matches
}

export const useAppStore = defineStore('app', () => {
  const sidebarCollapsed = ref(prefersCollapsedSidebarByViewport())
  const mobileSidebarOpen = ref(false)
  const locale = useAppStorage<SupportedLocale>(APPEARANCE_KEYS.locale, 'en', {
    validate: isSupportedLocale,
    fallback: 'en',
  })
  const theme = useAppStorage<ThemeName>(
    APPEARANCE_KEYS.theme,
    import.meta.env.VUESTRATA_THEME || 'default',
  )
  const isDark = useAppStorage<boolean>(APPEARANCE_KEYS.dark, () => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  const iconProvider = useAppStorage<IconProvider>(
    'vuestrata-icon-provider',
    import.meta.env.VUESTRATA_ICON_PROVIDER || 'solar',
    {
      validate: isAllowed(ICON_PROVIDERS),
      fallback: import.meta.env.VUESTRATA_ICON_PROVIDER || 'solar',
    },
  )

  const isRtl = computed(() => locale.value === 'ar')

  function toggleSidebar() {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      mobileSidebarOpen.value = !mobileSidebarOpen.value
      return
    }
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  function closeSidebar() {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      mobileSidebarOpen.value = false
      return
    }
    sidebarCollapsed.value = true
  }

  function openSidebar() {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      mobileSidebarOpen.value = true
      return
    }
    sidebarCollapsed.value = false
  }

  function setLocale(l: string) {
    if (!isSupportedLocale(l)) {
      appStoreLogger.warn('Ignoring unsupported locale', { locale: l })
      return
    }
    const previous = locale.value
    locale.value = l
    // Apply DOM-side effects through the shared writer so the bootstrap,
    // post-mount sync, and imperative setters all stay aligned. If the DOM
    // mutation throws (e.g. document not available in a worker context),
    // roll the store value back so it stays in sync with what the DOM
    // actually reflects.
    try {
      applyAppearance({ locale: l })
    } catch (err) {
      locale.value = previous
      appStoreLogger.warn('Failed to apply locale to DOM — reverting', {
        locale: l,
        err,
      })
    }
  }

  function setTheme(t: ThemeName) {
    theme.value = t
  }

  function toggleDark() {
    isDark.value = !isDark.value
  }

  function setIconProvider(p: IconProvider) {
    iconProvider.value = p
  }

  return {
    sidebarCollapsed,
    mobileSidebarOpen,
    locale,
    theme,
    isDark,
    iconProvider,
    isRtl,
    toggleSidebar,
    closeSidebar,
    openSidebar,
    setLocale,
    setTheme,
    toggleDark,
    setIconProvider,
  }
})
