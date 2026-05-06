<script setup lang="ts">
import type { IconName } from '@/types'

defineProps<{
  title?: string
  icon?: IconName
  to?: string
}>()
</script>

<template>
  <component
    :is="to ? 'RouterLink' : 'div'"
    :to="to"
    :class="[
      'docs-card group border-surface-200 bg-surface-50 dark:border-surface-700 dark:bg-surface-900 block rounded-lg border p-5 no-underline! transition-all duration-200',
      to
        ? 'hover:border-primary-300 hover:bg-primary-50/40 dark:hover:border-primary-700 dark:hover:bg-primary-950/20 focus-visible:ring-primary-300/30 dark:focus-visible:ring-offset-surface-950 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none'
        : '',
    ]"
  >
    <div class="flex h-full flex-col gap-3">
      <div class="flex items-start gap-3">
        <AppIcon
          v-if="icon"
          :name="icon"
          class="text-primary-600 dark:text-primary-300 mt-0.5 h-5 w-5 shrink-0 transition-transform duration-200 group-hover:-translate-y-0.5"
          aria-hidden="true"
        />
        <h3
          v-if="title"
          class="text-surface-900 dark:text-surface-100 m-0! text-base leading-6 font-semibold"
        >
          {{ title }}
        </h3>
      </div>
      <div>
        <div class="text-surface-600 dark:text-surface-400 text-sm leading-6">
          <slot />
        </div>
      </div>
    </div>
  </component>
</template>
