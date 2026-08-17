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
          <Logo variant="icon" className="h-8 w-8" />
        </span>
        <div class="min-w-0">
          <p class="text-muted-foreground text-sm">
            © {{ year }} Vuestrata. {{ t('home_footer') }}
          </p>
        </div>
      </div>

      <!-- Semantic tokens, not `text-surface-600 dark:text-surface-300`. A ramp
           step is only a safe foreground on a ramp that runs where you assume:
           Terminal's `surface-300` is #52525b, so the dark-mode pair rendered
           dark grey on near-black at 2.63:1. `muted-foreground` is re-pointed
           per theme precisely so callers do not have to know that. -->
      <div class="flex flex-wrap items-center gap-2">
        <RouterLink
          to="/docs"
          class="border-border bg-muted text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
        >
          <span class="i-solar-document-text-bold h-4 w-4" />
          {{ t('common_documentation') }}
        </RouterLink>
        <a
          href="https://github.com/boussadjra/vuestrata"
          target="_blank"
          rel="noopener noreferrer"
          class="border-border bg-muted text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
        >
          <span class="i-solar-github-bold h-4 w-4" />
          <span>GitHub</span>
        </a>
      </div>
    </div>
  </footer>
</template>
