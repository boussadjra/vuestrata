import { useTheme } from './useTheme'

/**
 * Reads resolved CSS custom-property colors from the document root.
 * Reactively updates when the theme or dark mode changes.
 */
export function useThemeColors() {
  const { currentThemeName, isDark } = useTheme()

  const primary = ref('#14b8a6')
  const primary400 = ref('#2dd4bf')
  const secondary = ref('#f59e0b')
  const secondary400 = ref('#fbbf24')
  const accent = ref('#cc62b3')
  const accent400 = ref('#e879f9')
  const surface600 = ref('#475569')
  const surfaceFg = ref('#0f172a')
  const surfaceBg = ref('rgba(255,255,255,0.95)')
  const surfaceBorder = ref('#e2e8f0')

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
      primary400.value = read('--color-primary-400', '#2dd4bf')
      secondary.value = read('--color-secondary-500', '#f59e0b')
      secondary400.value = read('--color-secondary-400', '#fbbf24')
      accent.value = read('--color-accent-500', '#cc62b3')
      accent400.value = read('--color-accent-400', '#e879f9')
      surface600.value = read('--color-surface-600', '#475569')
      const dark = isDark.value
      surfaceFg.value = dark
        ? read('--color-surface-50', '#f8fafc')
        : read('--color-surface-900', '#0f172a')
      surfaceBg.value = dark ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.95)'
      surfaceBorder.value = dark
        ? read('--color-surface-700', '#334155')
        : read('--color-surface-200', '#e2e8f0')
    })
  })

  return {
    primary,
    primary400,
    secondary,
    secondary400,
    accent,
    accent400,
    surface600,
    surfaceFg,
    surfaceBg,
    surfaceBorder,
  }
}
