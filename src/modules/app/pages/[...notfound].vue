<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { resolveIcon } from '@/config/icon-provider'

const { t } = useI18n()
</script>

<template>
  <main class="bg-surface-50 dark:bg-surface-950 flex min-h-screen items-center px-5 py-12">
    <section class="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
      <div class="border-surface-200 dark:border-surface-800 border-y py-8">
        <p
          class="text-primary-600 dark:text-primary-400 mb-3 text-sm font-semibold tracking-wide uppercase"
        >
          {{ t('not_found_kicker') }}
        </p>
        <h1
          class="text-surface-900 dark:text-surface-50 font-mono text-7xl leading-none font-bold md:text-8xl"
        >
          404
        </h1>
      </div>

      <div>
        <h2
          class="text-surface-900 dark:text-surface-50 text-3xl font-bold tracking-tight md:text-4xl"
        >
          {{ t('not_found_message') }}
        </h2>
        <p class="text-surface-600 dark:text-surface-400 mt-4 max-w-2xl text-lg leading-relaxed">
          {{ t('not_found_description') }}
        </p>

        <div class="mt-8 flex flex-wrap gap-3">
          <RouterLink
            to="/"
            class="bg-primary-500 hover:bg-primary-600 focus-visible:ring-primary-300/30 dark:focus-visible:ring-offset-surface-950 text-surface-50 inline-flex min-h-11 items-center gap-2 rounded-lg px-5 py-3 font-semibold shadow-(--shadow-soft) transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <span :class="[resolveIcon('home'), 'h-5 w-5']" aria-hidden="true" />
            {{ t('not_found_home') }}
          </RouterLink>
          <RouterLink
            to="/docs"
            class="border-surface-200 bg-surface-50 text-surface-700 hover:border-primary-300 hover:bg-surface-100 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-200 dark:hover:border-primary-700 dark:hover:bg-surface-800 focus-visible:ring-primary-300/30 dark:focus-visible:ring-offset-surface-950 inline-flex min-h-11 items-center gap-2 rounded-lg border px-5 py-3 font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <span :class="[resolveIcon('document'), 'h-5 w-5']" aria-hidden="true" />
            {{ t('not_found_docs') }}
          </RouterLink>
        </div>
      </div>
    </section>
  </main>
</template>

<route lang="yaml">
meta:
  layout: blank
</route>
