<script setup lang="ts">
import AppNotifications from '@/components/layout/AppNotifications.vue'
import SkipLink from '@/components/layout/SkipLink.vue'
</script>

<template>
  <div class="bg-background text-foreground flex min-h-screen items-center justify-center">
    <SkipLink />
    <main id="main-content" tabindex="-1" class="w-full max-w-md px-4 py-8 focus:outline-none">
      <RouterView />
    </main>
    <AppNotifications />
  </div>
</template>
