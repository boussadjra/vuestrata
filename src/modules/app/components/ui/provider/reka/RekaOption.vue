<script setup lang="ts">
import BaseOptionItem from '@/components/ui/base/BaseOptionItem.vue'

defineProps<{
  label: string
  value: string
  disabled?: boolean
}>()
</script>

<template>
  <BaseOptionItem v-bind="$props" provider="reka" />
</template>
