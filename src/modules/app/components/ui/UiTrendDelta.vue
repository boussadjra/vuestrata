<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { useFormatters } from '@/composables/useFormatters'
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

const { t } = useI18n()
const { signedPercent } = useFormatters()

const toneClass = computed(() => {
  if (props.direction === 'flat') return 'text-muted-foreground'
  return props.isImprovement
    ? 'text-success-700 dark:text-success-300'
    : 'text-danger-700 dark:text-danger-300'
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
  const direction =
    props.direction === 'up'
      ? t('dash_trend_up')
      : props.direction === 'down'
        ? t('dash_trend_down')
        : t('dash_trend_flat')
  return t('dash_trend_label', {
    change: signedPercent(props.changePercent),
    direction,
    comparedTo: props.comparedTo ?? '',
  }).trim()
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
