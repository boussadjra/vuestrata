<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Logo from '@/components/Logo.vue'

const { t } = useI18n()

const year = new Date().getFullYear()
</script>

<template>
  <footer class="border-surface-200/60 dark:border-surface-700/40 border-t px-4 py-8 lg:px-6">
    <div
      class="text-surface-500 mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-sm sm:flex-row"
    >
      <div class="flex items-center gap-2">
        <span class="mt-2 h-10 w-auto shrink-0">
          <Logo className="" />
        </span>
        <span class="whitespace-nowrap">© {{ year }} Vuestrata. {{ t('home_footer') }}</span>
      </div>
      <div class="flex items-center gap-4">
        <a
          href="https://github.com/boussadjra/vuestrata"
          target="_blank"
          rel="noopener noreferrer"
          class="group hover:text-surface-700 dark:hover:text-surface-300 flex items-center gap-1.5 transition-colors"
        >
          <span class="i-solar-github-bold h-5 w-5 transition-transform group-hover:scale-110" />
          <span class="hidden text-xs font-medium sm:inline">GitHub</span>
        </a>
      </div>
    </div>
  </footer>
</template>
