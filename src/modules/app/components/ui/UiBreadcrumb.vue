<script setup lang="ts">
import BaseBreadcrumbField from '@/components/ui/base/BaseBreadcrumbField.vue'
import type { BreadcrumbItem } from '~/types'

export type { BreadcrumbItem }

defineProps<{
  items: BreadcrumbItem[]
}>()
</script>

<template>
  <BaseBreadcrumbField v-bind="$props" provider="reka" />
</template>
