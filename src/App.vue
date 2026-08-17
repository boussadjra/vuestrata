<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { useLocaleSync } from '@/composables/useActiveLocale'
import { useShapeSync } from '@/composables/useShape'
import { useThemeSync } from '@/composables/useTheme'

// Root-owned DOM sync for theme, dark mode, locale, and shape classes.
useThemeSync()
useLocaleSync()
useShapeSync()

const { t } = useI18n()
const appError = ref<Error | null>(null)

// Only capture errors that originate from async component setup (Suspense).
// Transient render-cycle errors (e.g. a computed accessing data before onMounted fills it)
// recover on the next tick and must NOT be trapped.
onErrorCaptured((err, _instance, info) => {
  // Suspense-related info strings that indicate a fatal async setup failure
  const isSuspenseError = typeof info === 'string' && info.includes('async')
  if (!isSuspenseError) {
    // Let Vue's default handler (or app.config.errorHandler) deal with it
    return true
  }
  appError.value = err instanceof Error ? err : new Error(String(err))
  return false
})
</script>

<template>
  <div
    v-if="appError"
    role="alert"
    class="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center"
  >
    <p class="text-surface-600 dark:text-surface-400 text-sm">
      {{ t('common_error_generic') }}
    </p>
  </div>

  <Suspense v-else>
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
</template>
