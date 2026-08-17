<script setup lang="ts">
import { RouterLink } from 'vue-router'

import { resolveIcon } from '~/config/icon-provider'

defineProps<{
  to: string
  title: string
  body: string
}>()
</script>

<template>
  <RouterLink
    :to="to"
    class="group border-border bg-card hover:bg-muted focus-visible:ring-primary-300 flex items-center gap-4 rounded-2xl border p-5 no-underline shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
  >
    <div class="min-w-0 flex-1">
      <h2 class="text-foreground text-base font-semibold">{{ title }}</h2>
      <p class="text-muted-foreground mt-1 text-sm">{{ body }}</p>
    </div>
    <span
      class="text-muted-foreground flex h-8 w-8 shrink-0 items-center justify-center"
      aria-hidden="true"
    >
      <span
        :class="[
          resolveIcon('arrow-right'),
          'h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5',
        ]"
      />
    </span>
  </RouterLink>
</template>
