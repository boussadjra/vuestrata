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
      'docs-card group border-surface-200/80 bg-surface-50/92 dark:border-surface-800 dark:bg-surface-900/88 block overflow-hidden rounded-[calc(var(--shape-radius)+0.125rem)] border p-6 no-underline! shadow-[var(--shadow-soft)] transition-[transform,box-shadow,border-color,background-color] duration-200',
      to
        ? 'hover:border-primary-200 hover:bg-surface-50 dark:hover:border-primary-700/70 dark:hover:bg-surface-900 focus-visible:ring-primary-300/30 dark:focus-visible:ring-offset-surface-950 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none'
        : '',
    ]"
  >
    <div class="flex h-full flex-col gap-4">
      <div class="flex items-start justify-between gap-4">
        <div class="flex min-w-0 items-start gap-3">
          <span
            v-if="icon"
            class="border-surface-200 bg-surface-50 text-primary-600 dark:border-surface-700 dark:bg-surface-950 dark:text-primary-300 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border"
          >
            <AppIcon v-if="icon" :name="icon" class="h-5 w-5" aria-hidden="true" />
          </span>
          <div class="min-w-0">
            <h3
              v-if="title"
              class="text-surface-950 dark:text-surface-50 m-0! text-lg leading-7 font-semibold tracking-tight"
            >
              {{ title }}
            </h3>
          </div>
        </div>

        <span
          v-if="to"
          class="i-solar-arrow-right-up-linear text-surface-300 dark:text-surface-600 mt-0.5 h-5 w-5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          aria-hidden="true"
        />
      </div>

      <div class="text-surface-600 dark:text-surface-400 text-sm leading-6">
        <slot />
      </div>
    </div>
  </component>
</template>
