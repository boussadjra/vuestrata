<script setup lang="ts"></script>

<template>
  <div
    class="bg-surface-50 dark:bg-surface-950 text-surface-900 dark:text-surface-100 flex min-h-screen flex-col"
  >
    <AppHeader />
    <main class="flex-1">
      <RouterView />
    </main>
    <AppFooter />
    <AppNotifications />
  </div>
</template>
