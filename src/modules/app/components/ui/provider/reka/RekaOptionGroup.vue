<script setup lang="ts">
import { useOptionGroup } from '@formwerk/core'

const props = defineProps<{
  label: string
}>()

const { groupProps, labelProps } = useOptionGroup({
  label: () => props.label,
})
</script>

<template>
  <div v-bind="groupProps" data-provider="reka" class="py-1">
    <div
      v-bind="labelProps"
      class="text-surface-400 dark:text-surface-500 px-3 py-1.5 text-xs font-semibold tracking-wide uppercase"
    >
      {{ label }}
    </div>
    <slot />
  </div>
</template>
