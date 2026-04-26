<script setup lang="ts">
import { resolveIcon } from '@/config/icon-provider'
import type { IconName } from '~/types'

const props = withDefaults(
  defineProps<{
    name: IconName
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  }>(),
  {
    size: 'md',
  },
)

const sizeClasses: Record<string, string> = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
  xl: 'h-8 w-8',
}

const iconClass = computed(() => resolveIcon(props.name))
const sizeClass = computed(() => sizeClasses[props.size] ?? sizeClasses.md)
</script>

<template>
  <span :class="[iconClass, sizeClass]" aria-hidden="true" />
</template>
