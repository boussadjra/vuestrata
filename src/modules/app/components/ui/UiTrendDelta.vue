<script setup lang="ts">
import { useFormatters } from '@/composables/useFormatters'
import { getI18n } from '@/plugins/i18n'
import { resolveIcon } from '~/config/icon-provider'

export interface TrendDeltaProps {
  /** Percentage change. Sign is rendered explicitly. */
  changePercent: number
  direction: 'up' | 'down' | 'flat'
  /**
   * Whether this movement is GOOD, decided by the caller.
   *
   * Not derived from `direction`: falling churn is an improvement and rising
   * churn is not, so tying colour to the arrow would be wrong half the time.
   */
  isImprovement: boolean
  /** Already-localized comparison window. Announced so the number has a reference point. */
  comparedTo?: string
  size?: 'sm' | 'md'
}

const props = withDefaults(defineProps<TrendDeltaProps>(), { size: 'md' })

const { signedPercent } = useFormatters()

/**
 * The two branches are deliberately asymmetric.
 *
 * `text-success` is the semantic status-text token. There is no
 * `text-destructive` equivalent here because `--color-destructive` is tuned as
 * a FILL (it pairs with `--color-destructive-foreground` on buttons) and sits
 * at `danger-600`, which measures 3.70:1 on Terminal's light card — below AA.
 * `danger-700` clears it at 4.96:1. Swapping this to `text-destructive` for
 * symmetry would reintroduce the contrast bug this file was fixed for.
 */
const toneClass = computed(() => {
  if (props.direction === 'flat') return 'text-muted-foreground'
  return props.isImprovement ? 'text-success' : 'text-danger-700 dark:text-danger-300'
})

const iconName = computed(() => {
  if (props.direction === 'up') return 'arrow-up'
  if (props.direction === 'down') return 'arrow-down'
  return 'minus-circle'
})

/**
 * The full sentence a screen reader hears.
 *
 * The visual form leans on an arrow and a colour to say "up" and "good" — both
 * unavailable to a screen-reader user, and colour alone is not a permissible
 * carrier of meaning (WCAG 1.4.1). This states it in words.
 */
const accessibleLabel = computed(() => {
  const t = getI18n().global.t
  const direction =
    props.direction === 'up'
      ? String(t('dash_trend_up'))
      : props.direction === 'down'
        ? String(t('dash_trend_down'))
        : String(t('dash_trend_flat'))
  return String(
    t('dash_trend_label', {
      change: signedPercent(props.changePercent),
      direction,
      comparedTo: props.comparedTo ?? '',
    }),
  ).trim()
})
</script>

<template>
  <span
    :class="[
      'inline-flex items-center gap-1 font-semibold tabular-nums',
      toneClass,
      size === 'sm' ? 'text-xs' : 'text-sm',
    ]"
  >
    <!-- The arrow is decorative: the label below already says the direction. -->
    <span
      :class="[resolveIcon(iconName), size === 'sm' ? 'h-3 w-3' : 'h-4 w-4']"
      aria-hidden="true"
    />
    <span aria-hidden="true">{{ signedPercent(changePercent) }}</span>
    <span class="sr-only">{{ accessibleLabel }}</span>
  </span>
</template>
