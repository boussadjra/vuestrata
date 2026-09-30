<script setup lang="ts">
import { ConfigProvider } from 'reka-ui'
import { useI18n } from 'vue-i18n'

import { useActiveLocale, useLocaleSync } from '@/composables/useActiveLocale'
import { useDocumentTitle } from '@/composables/useDocumentTitle'
import { useShapeSync } from '@/composables/useShape'
import { useThemeSync } from '@/composables/useTheme'

import AppErrorBoundary from './AppErrorBoundary.vue'

// Root-owned DOM sync for theme, dark mode, locale, and shape classes.
useThemeSync()
useLocaleSync()
useShapeSync()
// Keeps <title> in step with the route. Without it every page shared one
// title, which also made useRouteAnnouncer's document.title fallback useless.
useDocumentTitle()

const { t } = useI18n()
const { current, dir } = useActiveLocale()

// Reka portals default to dir=ltr unless ConfigProvider supplies the reading
// direction. html[dir] is not inherited by a teleported tree that Reka then
// stamps with dir="ltr".
</script>

<template>
  <ConfigProvider :dir="dir" :locale="current">
    <AppErrorBoundary>
      <Suspense>
        <RouterView />

        <template #fallback>
          <div
            class="flex min-h-screen items-center justify-center"
            role="status"
            :aria-label="t('common_loading_aria')"
          >
            <AppIcon name="spinner" size="xl" class="text-primary-500 animate-spin" />
          </div>
        </template>
      </Suspense>
    </AppErrorBoundary>
  </ConfigProvider>
</template>
