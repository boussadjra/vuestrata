<script setup lang="ts">
import { resolveIcon } from '~/config/icon-provider'
import type { BreadcrumbItem } from '~/types'

export type { BreadcrumbItem }

defineProps<{
  items: BreadcrumbItem[]
}>()
</script>

<template>
  <nav aria-label="Breadcrumb" data-provider="reka" data-ui="breadcrumb">
    <ol class="flex items-center gap-1.5 text-sm">
      <li v-for="(item, index) in items" :key="index" class="inline-flex items-center gap-1.5">
        <span
          v-if="index > 0"
          :class="[resolveIcon('chevron-right'), 'text-surface-400 h-3.5 w-3.5']"
        />
        <RouterLink
          v-if="item.to && index < items.length - 1"
          :to="item.to"
          class="text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors"
        >
          <span v-if="item.icon" :class="[item.icon, 'mr-1 h-4 w-4']" />
          {{ item.label }}
        </RouterLink>
        <span v-else class="text-surface-900 dark:text-surface-100 font-medium">
          <span v-if="item.icon" :class="[item.icon, 'mr-1 h-4 w-4']" />
          {{ item.label }}
        </span>
      </li>
    </ol>
  </nav>
</template>
