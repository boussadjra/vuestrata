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
    class="group border-surface-200 dark:border-surface-700 dark:bg-surface-800 hover:shadow-elevated hover:border-primary-300 dark:hover:border-primary-600 block rounded-2xl bg-white p-5 no-underline! transition-all duration-200 hover:-translate-y-0.5"
  >
    <div class="flex flex-col gap-2">
      <div class="flex items-center gap-3">
        <AppIcon
          v-if="icon"
          :name="icon"
          class="text-primary-500 h-6 w-6 shrink-0 transition-transform duration-200 group-hover:scale-110"
          aria-hidden="true"
        />
        <h3
          v-if="title"
          class="text-surface-900 dark:text-surface-100 m-0! text-base font-semibold"
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
