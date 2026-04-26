import { useTheme } from './useTheme'

/**
 * Reads resolved CSS custom-property colors from the document root.
 * Reactively updates when the theme or dark mode changes.
 */
export function useThemeColors() {
  const { currentThemeName, isDark } = useTheme()

  const primary = ref('#14b8a6')
  const secondary = ref('#f59e0b')
  const accent = ref('#cc62b3')
  const surface600 = ref('#475569')

  function read(prop: string, fallback: string): string {
    if (typeof window === 'undefined') return fallback
    const v = getComputedStyle(document.documentElement).getPropertyValue(prop).trim()
    return v || fallback
  }

  watchEffect(() => {
    // Touch reactive deps so this re-runs on theme/dark change
    void currentThemeName.value
    void isDark.value
    // Read after a microtick so CSS has applied
    queueMicrotask(() => {
      primary.value = read('--color-primary-500', '#14b8a6')
      secondary.value = read('--color-secondary-500', '#f59e0b')
      accent.value = read('--color-accent-500', '#cc62b3')
      surface600.value = read('--color-surface-600', '#475569')
    })
  })

  return { primary, secondary, accent, surface600 }
}
