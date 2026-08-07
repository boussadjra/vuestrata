<script setup lang="ts">
import { SelectGroup, SelectLabel } from 'reka-ui'

const props = defineProps<{
  label: string
}>()
</script>

<template>
  <SelectGroup data-provider="reka" class="py-1">
    <SelectLabel
      class="text-muted-foreground px-3 py-1.5 text-xs font-semibold tracking-wide uppercase"
    >
      {{ label }}
    </SelectLabel>
    <slot />
  </SelectGroup>
</template>
