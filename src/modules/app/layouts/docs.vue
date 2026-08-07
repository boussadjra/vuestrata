<script setup lang="ts">
import AppHeader from '@/components/layout/AppHeader.vue'
import AppNotifications from '@/components/layout/AppNotifications.vue'
import SkipLink from '@/components/layout/SkipLink.vue'
</script>

<template>
  <div class="bg-background text-foreground flex h-screen flex-col">
    <SkipLink />
    <AppHeader />
    <main id="main-content" tabindex="-1" class="min-h-0 flex-1 overflow-hidden focus:outline-none">
      <RouterView />
    </main>
    <AppNotifications />
  </div>
</template>
