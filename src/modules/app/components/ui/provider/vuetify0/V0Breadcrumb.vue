<script setup lang="ts">
import { Breadcrumbs } from '@vuetify/v0'

import BaseBreadcrumbField from '@/components/ui/base/BaseBreadcrumbField.vue'
import type { BreadcrumbItem } from '~/types'

defineProps<{
  items: BreadcrumbItem[]
}>()
</script>

<template>
  <BaseBreadcrumbField
    v-bind="$props"
    provider="vuetify0"
    :root-component="Breadcrumbs.Root"
    :list-component="Breadcrumbs.List"
    :item-component="Breadcrumbs.Item"
    :divider-component="Breadcrumbs.Divider"
    :page-component="Breadcrumbs.Page"
  />
</template>
