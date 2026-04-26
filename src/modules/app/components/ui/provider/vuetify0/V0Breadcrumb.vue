<script setup lang="ts">
import { Breadcrumbs } from '@vuetify/v0'

import { resolveIcon } from '~/config/icon-provider'
import type { BreadcrumbItem } from '~/types'

defineProps<{
  items: BreadcrumbItem[]
}>()
</script>

<template>
  <Breadcrumbs.Root data-provider="vuetify0" data-ui="breadcrumb">
    <Breadcrumbs.List class="flex items-center gap-1.5 text-sm">
      <Breadcrumbs.Item
        v-for="(item, index) in items"
        :key="index"
        class="inline-flex items-center gap-1.5"
      >
        <Breadcrumbs.Divider v-if="index > 0">
          <span :class="[resolveIcon('chevron-right'), 'text-surface-400 h-3.5 w-3.5']" />
        </Breadcrumbs.Divider>
        <RouterLink
          v-if="item.to && index < items.length - 1"
          :to="item.to"
          class="text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors"
        >
          <span v-if="item.icon" :class="[item.icon, 'mr-1 h-4 w-4']" />
          {{ item.label }}
        </RouterLink>
        <Breadcrumbs.Page v-else class="text-surface-900 dark:text-surface-100 font-medium">
          <span v-if="item.icon" :class="[item.icon, 'mr-1 h-4 w-4']" />
          {{ item.label }}
        </Breadcrumbs.Page>
      </Breadcrumbs.Item>
    </Breadcrumbs.List>
  </Breadcrumbs.Root>
</template>
