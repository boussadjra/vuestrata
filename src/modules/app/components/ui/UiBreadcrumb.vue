<script setup lang="ts">
import type { Component } from 'vue'
import { RouterLink } from 'vue-router'

import { resolveIcon } from '~/config/icon-provider'
import type { BreadcrumbItem } from '~/types'

export interface BreadcrumbProps {
  provider?: 'reka'
  items: BreadcrumbItem[]
  rootComponent?: Component
  listComponent?: Component
  itemComponent?: Component
  dividerComponent?: Component
  pageComponent?: Component
}

const props = withDefaults(defineProps<BreadcrumbProps>(), {
  provider: 'reka',
  rootComponent: undefined,
  listComponent: undefined,
  itemComponent: undefined,
  dividerComponent: undefined,
  pageComponent: undefined,
})

const useProviderBreadcrumb = computed(() =>
  Boolean(
    props.rootComponent &&
    props.listComponent &&
    props.itemComponent &&
    props.dividerComponent &&
    props.pageComponent,
  ),
)
</script>

<template>
  <component
    :is="rootComponent"
    v-if="useProviderBreadcrumb"
    :data-provider="provider"
    data-ui="breadcrumb"
  >
    <component :is="listComponent" class="flex items-center gap-1.5 text-sm">
      <component
        :is="itemComponent"
        v-for="(item, index) in items"
        :key="index"
        class="inline-flex items-center gap-1.5"
      >
        <component :is="dividerComponent" v-if="index > 0">
          <span :class="[resolveIcon('chevron-right'), 'text-muted-foreground h-3.5 w-3.5']" />
        </component>
        <RouterLink
          v-if="item.to && index < items.length - 1"
          :to="item.to"
          class="text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors"
        >
          <span v-if="item.icon" :class="[item.icon, 'me-1 h-4 w-4']" />
          {{ item.label }}
        </RouterLink>
        <component :is="pageComponent" v-else class="text-foreground font-medium">
          <span v-if="item.icon" :class="[item.icon, 'me-1 h-4 w-4']" />
          {{ item.label }}
        </component>
      </component>
    </component>
  </component>

  <nav v-else aria-label="Breadcrumb" :data-provider="provider" data-ui="breadcrumb">
    <ol class="flex items-center gap-1.5 text-sm">
      <li v-for="(item, index) in items" :key="index" class="inline-flex items-center gap-1.5">
        <span
          v-if="index > 0"
          :class="[resolveIcon('chevron-right'), 'text-muted-foreground h-3.5 w-3.5']"
        />
        <RouterLink
          v-if="item.to && index < items.length - 1"
          :to="item.to"
          class="text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors"
        >
          <span v-if="item.icon" :class="[item.icon, 'me-1 h-4 w-4']" />
          {{ item.label }}
        </RouterLink>
        <span v-else class="text-foreground font-medium">
          <span v-if="item.icon" :class="[item.icon, 'me-1 h-4 w-4']" />
          {{ item.label }}
        </span>
      </li>
    </ol>
  </nav>
</template>
