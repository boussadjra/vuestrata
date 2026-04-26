<script setup lang="ts">
import AppNotifications from '@/components/layout/AppNotifications.vue'
</script>

<template>
  <div
    class="bg-surface-50 dark:bg-surface-950 text-surface-900 dark:text-surface-100 flex min-h-screen items-center justify-center"
  >
    <div class="w-full max-w-md px-4">
      <RouterView />
    </div>
    <AppNotifications />
  </div>
</template>
