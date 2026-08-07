<script setup lang="ts">
/**
 * A currency amount, right-aligned and tabular.
 *
 * `tabular-nums` matters in a column of figures: with proportional digits a
 * "1" is narrower than a "0", so the decimal points wander and the column
 * becomes unscannable. Alignment is `end`, not `right`, so it follows the
 * writing direction in RTL locales.
 */
import { useFormatters } from '@/composables/useFormatters'
import type { Money } from '~/lib/money'

const props = defineProps<{ value: Money; compact?: boolean }>()

const { currency } = useFormatters()
const formatted = computed(() => currency(props.value.amount, props.value.currency, props.compact))
</script>

<template>
  <span class="block text-end tabular-nums">{{ formatted }}</span>
</template>
