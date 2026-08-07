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
  <header class="flex flex-wrap items-start justify-between gap-4">
    <div class="min-w-0">
      <h1 class="text-foreground text-2xl font-extrabold tracking-tight sm:text-3xl">
        {{ title }}
      </h1>
      <p v-if="description" class="text-muted-foreground mt-1 text-sm">{{ description }}</p>
      <slot name="meta" />
    </div>

    <!-- Filters and page-level actions. -->
    <div class="flex shrink-0 flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
