import { useTheme } from './useTheme'

/**
 * Resolved theme colours for canvas-rendered surfaces (ECharts).
 *
 * Charts draw to a canvas, so they cannot use CSS classes and must be handed
 * concrete colour strings. Everything here is read from the semantic tokens in
 * `styles/semantic.css`, which means a chart follows the active theme and picks
 * up the dark-mode flip without any per-chart branching.
 *
 * Previously this exposed brand ramp steps directly (`primary`, `accent400`, …)
 * and hardcoded `surfaceBg` to a literal rgba that no theme could influence.
 */

/** Number of categorical chart slots defined in semantic.css. */
export const CHART_SERIES_COUNT = 8

/**
 * Fallbacks used before the first paint and in non-DOM environments (SSR,
 * unit tests). They are intentionally the DEFAULT theme's light-mode values —
 * a chart that renders one frame with the wrong theme is better than one that
 * renders invisible.
 */
const FALLBACK_SERIES = [
  '#1a8164',
  '#cc62b3',
  '#0ea5e9',
  '#f59e0b',
  '#8e7d68',
  '#059669',
  '#80d5b6',
  '#843069',
]

export function useThemeColors() {
  const { currentThemeName, isDark } = useTheme()

  /** Categorical series colours, in order. */
  const series = ref<string[]>([...FALLBACK_SERIES])

  /** Chrome: axis labels, gridlines, tooltip surface. */
  const foreground = ref('#0f172a')
  const mutedForeground = ref('#64748b')
  const border = ref('#e2e8f0')
  const elevated = ref('#ffffff')

  function read(prop: string, fallback: string): string {
    if (typeof window === 'undefined') return fallback
    const value = getComputedStyle(document.documentElement).getPropertyValue(prop).trim()
    return value || fallback
  }

  watchEffect(() => {
    // Touch reactive deps so this re-runs on a theme or colour-mode change.
    void currentThemeName.value
    void isDark.value

    // Read after a microtask so the class change has been applied to <html>
    // and the new custom-property values are resolvable.
    queueMicrotask(() => {
      series.value = Array.from({ length: CHART_SERIES_COUNT }, (_, index) =>
        read(`--color-chart-${index + 1}`, FALLBACK_SERIES[index] ?? FALLBACK_SERIES[0]!),
      )
      foreground.value = read('--color-foreground', '#0f172a')
      mutedForeground.value = read('--color-muted-foreground', '#64748b')
      border.value = read('--color-border', '#e2e8f0')
      // Tooltip/popover background. Read from the token rather than a literal,
      // so a theme that defines its own elevated surface is respected.
      elevated.value = read('--color-elevated', isDark.value ? '#1e293b' : '#ffffff')
    })
  })

  return { series, foreground, mutedForeground, border, elevated }
}
