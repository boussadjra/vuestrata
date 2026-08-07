<script setup lang="ts">
/**
 * A date in a table cell.
 *
 * Wrapped in `<time datetime>` so the machine-readable value survives
 * localization, and given a `title` with the absolute timestamp when showing a
 * relative one — "3 days ago" is easy to scan but useless when you need the
 * actual date.
 */
import { useFormatters } from '@/composables/useFormatters'

const props = withDefaults(defineProps<{ value: string; relative?: boolean }>(), {
  relative: false,
})

const { date, dateTime, relativeTime } = useFormatters()

const display = computed(() => (props.relative ? relativeTime(props.value) : date(props.value)))
</script>

<template>
  <time :datetime="value" :title="dateTime(value)" class="block text-end tabular-nums">
    {{ display }}
  </time>
</template>
