<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { UiButton } from '@/components/ui'
import { resolveIcon } from '@/config/icon-provider'

const { t } = useI18n()
</script>

<template>
  <main class="bg-background flex min-h-screen items-center px-5 py-12">
    <section class="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
      <div class="border-surface-200 dark:border-surface-800 border-y py-8">
        <p
          class="text-primary-600 dark:text-primary-400 mb-3 text-sm font-semibold tracking-wide uppercase"
        >
          {{ t('not_found_kicker') }}
        </p>
        <h1 class="text-foreground font-mono text-7xl leading-none font-bold md:text-8xl">404</h1>
      </div>

      <div>
        <h2 class="text-foreground text-3xl font-bold tracking-tight md:text-4xl">
          {{ t('not_found_message') }}
        </h2>
        <p class="text-muted-foreground mt-4 max-w-2xl text-lg leading-relaxed">
          {{ t('not_found_description') }}
        </p>

        <div class="mt-8 flex flex-wrap gap-3">
          <UiButton to="/" variant="primary" size="lg">
            <span :class="[resolveIcon('home'), 'h-5 w-5']" aria-hidden="true" />
            {{ t('not_found_home') }}
          </UiButton>
          <UiButton to="/docs" variant="ghost" size="lg">
            <span :class="[resolveIcon('document'), 'h-5 w-5']" aria-hidden="true" />
            {{ t('not_found_docs') }}
          </UiButton>
        </div>
      </div>
    </section>
  </main>
</template>

<route lang="yaml">
meta:
  layout: blank
</route>
