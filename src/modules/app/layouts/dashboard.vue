<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import AppHeader from '@/components/layout/AppHeader.vue'
import AppNotifications from '@/components/layout/AppNotifications.vue'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import SkipLink from '@/components/layout/SkipLink.vue'
import { provideBreadcrumbOverride } from '@/composables/useBreadcrumbs'
import { useRouteAnnouncer } from '@/composables/useRouteAnnouncer'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const { t } = useI18n()

// Detail pages replace the trailing crumb with the entity they loaded
// (`Orders → ORD-1042`). Provided here so every dashboard page shares one ref.
provideBreadcrumbOverride()

// Announces each navigation and moves focus to <main>. In an SPA the browser
// does neither — the URL changes and the DOM swaps, but a screen reader is
// never told, and keyboard focus stays wherever the user last clicked.
const { announcement, mainRef } = useRouteAnnouncer()

onMounted(() => {
  if (typeof window === 'undefined') return
  if (window.matchMedia('(max-width: 1023px)').matches) {
    appStore.closeSidebar()
  }
})
</script>

<template>
  <div class="bg-background text-foreground min-h-screen">
    <SkipLink />
    <AppSidebar />
    <div
      :class="[
        'flex min-h-screen flex-col transition-all duration-300',
        appStore.sidebarCollapsed ? 'lg:ms-20' : 'lg:ms-72',
      ]"
    >
      <AppHeader :show-brand="false" />
      <!--
        `tabindex="-1"` makes <main> programmatically focusable so the skip link
        and the route announcer can move focus here. It stays out of the tab
        order, so it costs sighted keyboard users nothing.
      -->
      <main
        id="main-content"
        ref="mainRef"
        tabindex="-1"
        :aria-label="t('a11y_main_content')"
        class="min-w-0 flex-1 px-4 py-6 focus:outline-none lg:px-6 lg:py-8"
      >
        <RouterView />
      </main>
    </div>

    <!--
      Route-change announcements. `aria-live="polite"` waits for the screen
      reader to finish its current utterance instead of interrupting; `atomic`
      makes it read the whole message rather than just the changed words.
    -->
    <div aria-live="polite" aria-atomic="true" class="sr-only">{{ announcement }}</div>

    <AppNotifications />
  </div>
</template>
