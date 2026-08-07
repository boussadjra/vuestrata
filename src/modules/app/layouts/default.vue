<script setup lang="ts">
import SkipLink from '@/components/layout/SkipLink.vue'
</script>

<template>
  <div class="bg-surface-50 dark:bg-surface-950 text-foreground flex min-h-screen flex-col">
    <SkipLink />
    <AppHeader />
    <main id="main-content" tabindex="-1" class="flex-1 focus:outline-none">
      <RouterView />
    </main>
    <AppFooter />
    <AppNotifications />
  </div>
</template>
