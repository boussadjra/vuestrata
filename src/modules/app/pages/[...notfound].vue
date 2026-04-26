<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { resolveIcon } from '@/config/icon-provider'

const { t } = useI18n()
</script>

<template>
  <div class="flex min-h-screen items-center justify-center">
    <div class="text-center">
      <h1 class="text-primary-500 mb-4 text-7xl font-bold">404</h1>
      <p class="text-surface-600 dark:text-surface-400 mb-8 text-xl">
        {{ t('not_found_message') }}
      </p>
      <RouterLink
        to="/"
        class="bg-primary-500 hover:bg-primary-600 inline-flex items-center gap-2 rounded-lg px-6 py-3 font-medium text-white transition-colors"
      >
        <span :class="[resolveIcon('home'), 'h-5 w-5']" />
        {{ t('not_found_home') }}
      </RouterLink>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: blank
</route>
