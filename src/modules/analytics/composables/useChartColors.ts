import { useThemeColors } from '@/composables/useThemeColors'

/**
 * Semantic chart-color tokens for ECharts options.
 *
 * Wraps the raw CSS-custom-property refs from `useThemeColors` into
 * pre-shaped ECharts sub-objects so chart options never reference
 * `colors.surfaceBg.value` inline. Each returned ref is a plain object
 * ready to spread or assign — no `.value` drilling inside option trees.
 *
 * Placed in the analytics module because chart-specific shaping belongs
 * next to the consumers, not in the global composables layer.
 */
export function useChartColors() {
  const c = useThemeColors()

  /** Shared tooltip config. Spread into any ECharts `tooltip:` block. */
  const tooltip = computed(() => ({
    backgroundColor: c.surfaceBg.value,
    borderColor: c.surfaceBorder.value,
    textStyle: { color: c.surfaceFg.value },
    borderRadius: 8,
    padding: [12, 16] as [number, number],
  }))

  /** Axis label color. Spread into `axisLabel:` or add `margin` on top. */
  const axisLabel = computed(() => ({ color: c.surface600.value }))

  /** Dashed grid line style. Assign to `splitLine:`. */
  const splitLine = computed(() => ({
    lineStyle: { color: c.surfaceBorder.value, type: 'dashed' as const },
  }))

  /** Category axis line style. Assign to `axisLine:`. */
  const axisLine = computed(() => ({
    lineStyle: { color: c.surfaceBorder.value },
  }))

  /** Cross-hair pointer label background. Assign to `axisPointer.label:`. */
  const axisPointerLabel = computed(() => ({
    backgroundColor: c.surface600.value,
  }))

  /** Legend style. Spread into `legend:` and add positioning on top. */
  const legend = computed(() => ({
    textStyle: { color: c.surface600.value },
    itemWidth: 10,
    itemHeight: 10,
    icon: 'circle' as const,
  }))

  /**
   * Pie/donut item border. Spread into `series[].itemStyle:`.
   * Includes borderRadius so the donut segment pill corners stay consistent.
   */
  const pieItemBorder = computed(() => ({
    borderRadius: 12,
    borderColor: c.surfaceBorder.value,
    borderWidth: 3,
  }))

  /**
   * Ordered series palette.
   * Index 0 = primary, 1 = accent, 2 = secondary, 3 = secondary400, 4 = accent400.
   * Use `palette.value[n]` for `itemStyle.color` on the nth series.
   */
  const palette = computed(() => [
    c.primary.value,
    c.accent.value,
    c.secondary.value,
    c.secondary400.value,
    c.accent400.value,
  ])

  /**
   * Sparkline colors keyed by metric role.
   * Lighter 400-weight variants read well at h-5/h-7 sparkline heights.
   */
  const sparkPalette = computed(() => ({
    revenue: c.primary400.value,
    users: c.accent400.value,
    projects: c.secondary400.value,
    satisfaction: c.surface600.value,
  }))

  return {
    tooltip,
    axisLabel,
    splitLine,
    axisLine,
    axisPointerLabel,
    legend,
    pieItemBorder,
    palette,
    sparkPalette,
  }
}
