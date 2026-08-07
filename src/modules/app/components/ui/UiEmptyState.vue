<script setup lang="ts">
import { resolveIcon } from '~/config/icon-provider'
import type { IconName } from '~/types'

export interface EmptyStateProps {
  title: string
  description?: string
  icon?: IconName
  /**
   * Renders an error presentation instead of a neutral one.
   *
   * "No results" and "the request failed" are different situations and must not
   * look the same — the first is an expected outcome the user can act on by
   * changing filters, the second means the data is unknown. Showing an empty
   * list for a failed request tells the user something false.
   */
  variant?: 'empty' | 'error'
  size?: 'sm' | 'md'
}

withDefaults(defineProps<EmptyStateProps>(), {
  variant: 'empty',
  size: 'md',
  icon: 'folder',
})
</script>

<template>
  <div
    :class="[
      'flex flex-col items-center justify-center text-center',
      size === 'sm' ? 'gap-2 p-6' : 'gap-3 p-10',
    ]"
    :role="variant === 'error' ? 'alert' : 'status'"
  >
    <span
      :class="[
        'flex shrink-0 items-center justify-center rounded-full',
        size === 'sm' ? 'h-10 w-10' : 'h-14 w-14',
        variant === 'error' ? 'bg-destructive-subtle' : 'bg-muted',
      ]"
    >
      <span
        :class="[
          resolveIcon(variant === 'error' ? 'danger-triangle' : icon),
          size === 'sm' ? 'h-5 w-5' : 'h-7 w-7',
          variant === 'error' ? 'text-destructive' : 'text-muted-foreground',
        ]"
        aria-hidden="true"
      />
    </span>

    <p :class="['text-foreground font-semibold', size === 'sm' ? 'text-sm' : 'text-base']">
      {{ title }}
    </p>
    <p v-if="description" class="text-muted-foreground max-w-sm text-sm">{{ description }}</p>

    <!-- Recovery action: a retry button for errors, a filter reset for empties. -->
    <slot name="action" />
  </div>
</template>
