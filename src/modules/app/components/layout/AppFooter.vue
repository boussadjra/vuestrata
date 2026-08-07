<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Logo from '@/components/Logo.vue'

const { t } = useI18n()

const year = new Date().getFullYear()
</script>

<template>
  <footer
    class="border-surface-200/70 bg-surface-50/72 dark:border-surface-800/70 dark:bg-surface-950/70 border-t backdrop-blur-sm"
  >
    <div
      class="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 lg:flex-row lg:items-center lg:justify-between lg:px-6"
    >
      <div class="flex items-center gap-3">
        <span class="me-2 flex h-10 w-10 items-center">
          <Logo className="h-6 w-auto" />
        </span>
        <div class="min-w-0">
          <p class="text-muted-foreground text-[11px] font-medium tracking-[0.18em] uppercase">
            {{ t('common_starter_workbench') }}
          </p>
          <p class="text-muted-foreground text-sm">
            © {{ year }} Vuestrata. {{ t('home_footer') }}
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <RouterLink
          to="/docs"
          class="border-surface-200/80 bg-surface-50 text-surface-600 hover:text-surface-900 dark:border-surface-700/70 dark:bg-surface-900/75 dark:text-surface-300 dark:hover:text-surface-50 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
        >
          <span class="i-solar-document-text-bold h-4 w-4" />
          {{ t('common_documentation') }}
        </RouterLink>
        <a
          href="https://github.com/boussadjra/vuestrata"
          target="_blank"
          rel="noopener noreferrer"
          class="border-surface-200/80 bg-surface-50 text-surface-600 hover:text-surface-900 dark:border-surface-700/70 dark:bg-surface-900/75 dark:text-surface-300 dark:hover:text-surface-50 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
        >
          <span class="i-solar-github-bold h-4 w-4" />
          <span>GitHub</span>
        </a>
      </div>
    </div>
  </footer>
</template>
