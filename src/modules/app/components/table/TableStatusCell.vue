<script setup lang="ts">
/**
 * A status badge.
 *
 * The label is always rendered as text. Colour reinforces it and never carries
 * it alone (WCAG 1.4.1) — roughly one man in twelve cannot separate the green
 * and red variants, and nobody can read a colour in a screen reader.
 */
import UiBadge from '../ui/UiBadge.vue'

defineProps<{
  label: string
  variant?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error'
}>()
</script>

<template>
  <UiBadge :variant="variant ?? 'default'" size="sm">{{ label }}</UiBadge>
</template>
