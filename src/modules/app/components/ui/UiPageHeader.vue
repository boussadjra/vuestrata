<script setup lang="ts">
export interface PageHeaderProps {
  title: string
  description?: string
}

defineProps<PageHeaderProps>()
</script>

<template>
  <!--
    The page's single <h1>.
    Every dashboard page previously wrote its own heading markup, which is how
    heading levels and spacing drifted between them. Screen-reader users
    navigate by heading, so a consistent, correct outline is functional, not
    cosmetic.
  -->
  <header class="flex flex-wrap items-start justify-between gap-4 p-4">
    <div class="min-w-0 flex-1">
      <h1 class="text-foreground text-2xl font-extrabold tracking-tight sm:text-3xl">
        {{ title }}
      </h1>
      <p v-if="description" class="text-muted-foreground mt-2 text-sm">{{ description }}</p>
      <slot name="meta" />
    </div>

    <!--
      Full width below `sm` so a filter bar can stack instead of overflowing.
      `shrink-0` plus a shrink-to-fit child is what kept the 390px board
      scrolling sideways: wrap never kicked in because the row grew to fit.
    -->
    <div v-if="$slots.actions" class="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
      <slot name="actions" />
    </div>
  </header>
</template>
