<script setup lang="ts">
import { useBaseOptionGroup } from '@/components/ui/base'

const props = defineProps<{
  provider: 'reka'
  label: string
}>()

const { groupProps, labelProps } = useBaseOptionGroup(props)
</script>

<template>
  <div v-bind="groupProps" :data-provider="provider" class="py-1">
    <div
      v-bind="labelProps"
      class="text-surface-400 dark:text-surface-500 px-3 py-1.5 text-xs font-semibold tracking-wide uppercase"
    >
      {{ label }}
    </div>
    <slot />
  </div>
</template>
