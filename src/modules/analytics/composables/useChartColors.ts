import { useThemeColors } from '@/composables/useThemeColors'

/**
 * Apply an alpha channel to a resolved colour, for ECharts gradients and area
 * fills. Canvas cannot use CSS `color-mix`, so the conversion has to happen here.
 *
 * Handles `#rgb`, `#rrggbb`, `#rrggbbaa`, and `rgb()/rgba()`. Anything else —
 * `oklch()`, `color()`, a named colour — is returned UNCHANGED rather than
 * mangled: the previous helper assumed six hex digits unconditionally and
 * emitted `rgba(NaN,NaN,NaN,a)` for every other form, which paints nothing.
 * A fully-opaque fill is a far better failure than an invisible one.
 */
export function withAlpha(color: string, alpha: number): string {
  const value = color.trim()

  const hex = value.match(/^#([0-9a-f]{3,8})$/i)?.[1]
  if (hex && (hex.length === 3 || hex.length === 6 || hex.length === 8)) {
    // `replace` rather than spreading the string: the regex is already
    // constrained to ASCII hex digits, and spreading would invite the
    // code-point-splitting hazard the linter warns about for no benefit.
    const expand = hex.length === 3 ? hex.replace(/./g, (char) => char + char) : hex
    const r = Number.parseInt(expand.slice(0, 2), 16)
    const g = Number.parseInt(expand.slice(2, 4), 16)
    const b = Number.parseInt(expand.slice(4, 6), 16)
    return `rgba(${r},${g},${b},${alpha})`
  }

  const rgb = value.match(/^rgba?\(([^)]+)\)$/i)?.[1]
  if (rgb) {
    const [r, g, b] = rgb.split(/[\s,/]+/).filter(Boolean)
    if (r && g && b) return `rgba(${r},${g},${b},${alpha})`
  }

  return value
}

/**
 * Chart colour tokens, pre-shaped for ECharts option objects.
 *
 * Wraps `useThemeColors` so chart options never drill into `.value` inline.
 * Every colour traces back to a semantic token, so a chart follows the active
 * theme and flips with dark mode without per-chart branching.
 *
 * Lives in the analytics module because chart-specific shaping belongs next to
 * its consumers rather than in the global composables layer.
 */
export function useChartColors() {
  const colors = useThemeColors()

  /** Shared tooltip config. Spread into any ECharts `tooltip:` block. */
  const tooltip = computed(() => ({
    backgroundColor: colors.elevated.value,
    borderColor: colors.border.value,
    textStyle: { color: colors.foreground.value },
    borderRadius: 8,
    padding: [12, 16] as [number, number],
  }))

  /** Axis label colour. Spread into `axisLabel:` or add `margin` on top. */
  const axisLabel = computed(() => ({ color: colors.mutedForeground.value }))

  /** Dashed grid line style. Assign to `splitLine:`. */
  const splitLine = computed(() => ({
    lineStyle: { color: colors.border.value, type: 'dashed' as const },
  }))

  /** Category axis line style. Assign to `axisLine:`. */
  const axisLine = computed(() => ({
    lineStyle: { color: colors.border.value },
  }))

  /** Cross-hair pointer label background. Assign to `axisPointer.label:`. */
  const axisPointerLabel = computed(() => ({
    backgroundColor: colors.mutedForeground.value,
  }))

  /** Legend style. Spread into `legend:` and add positioning on top. */
  const legend = computed(() => ({
    textStyle: { color: colors.mutedForeground.value },
    itemWidth: 10,
    itemHeight: 10,
    icon: 'circle' as const,
  }))

  /**
   * Pie/donut item border. Spread into `series[].itemStyle:`.
   *
   * The border is the ELEVATED surface, not the border token: it exists to
   * separate adjacent segments by cutting the card colour between them, which
   * is what keeps a donut readable when two segments have similar colours.
   */
  const pieItemBorder = computed(() => ({
    borderRadius: 12,
    borderColor: colors.elevated.value,
    borderWidth: 3,
  }))

  /**
   * Ordered categorical palette — eight slots from `--color-chart-1..8`.
   *
   * The old palette had five entries taken straight off the brand ramps, two
   * pairs of which were a single ramp step apart, so series 2/4 and 3/5 were
   * near-indistinguishable. The semantic slots alternate hue family AND
   * lightness so adjacent series stay separable in greyscale and for viewers
   * with a colour-vision deficiency.
   *
   * Colour alone must never be the only channel carrying meaning (WCAG 1.4.1) —
   * pair these with direct labels, distinct dash patterns, or a data table.
   */
  const palette = computed(() => colors.series.value)

  /** Pick a series colour by index, wrapping past the end of the palette. */
  function seriesColor(index: number): string {
    const list = colors.series.value
    return list[index % list.length] ?? list[0]!
  }

  return {
    tooltip,
    axisLabel,
    splitLine,
    axisLine,
    axisPointerLabel,
    legend,
    pieItemBorder,
    palette,
    seriesColor,
  }
}
