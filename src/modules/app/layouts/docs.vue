<script setup lang="ts">
import AppHeader from '@/components/layout/AppHeader.vue'
import AppNotifications from '@/components/layout/AppNotifications.vue'
</script>

<template>
  <div
    class="bg-surface-50 dark:bg-surface-950 text-surface-900 dark:text-surface-100 flex h-screen flex-col"
  >
    <AppHeader />
    <div class="min-h-0 flex-1 overflow-hidden">
      <RouterView />
    </div>
    <AppNotifications />
  </div>
</template>
