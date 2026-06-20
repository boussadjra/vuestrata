<script setup lang="ts">
import AppHeader from '@/components/layout/AppHeader.vue'
import AppNotifications from '@/components/layout/AppNotifications.vue'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()

onMounted(() => {
  if (typeof window === 'undefined') return
  if (window.matchMedia('(max-width: 1023px)').matches) {
    appStore.closeSidebar()
  }
})
</script>

<template>
  <div
    class="bg-surface-50 dark:bg-surface-950 text-surface-900 dark:text-surface-100 min-h-screen"
  >
    <AppSidebar />
    <div
      :class="[
        'flex min-h-screen flex-col transition-all duration-300',
        appStore.sidebarCollapsed ? 'lg:ms-16' : 'lg:ms-64',
      ]"
    >
      <AppHeader :show-brand="false" />
      <main class="flex-1 p-4 lg:p-6">
        <RouterView />
      </main>
    </div>
    <AppNotifications />
  </div>
</template>
