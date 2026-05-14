<script setup lang="ts">
import { UiButton } from '@/components/ui'
import { resolveIcon } from '@/config/icon-provider'
</script>

<template>
  <section class="py-20 lg:py-24">
    <div class="mx-auto max-w-7xl px-5 sm:px-8">
      <div
        class="border-surface-200/80 bg-surface-50/88 dark:border-surface-800 dark:bg-surface-900/72 grid gap-8 rounded-[calc(var(--shape-radius)+0.5rem)] border p-6 shadow-(--shadow-card) lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:p-8"
      >
        <div>
          <p
            class="text-primary-600 dark:text-primary-400 mb-3 text-sm font-semibold tracking-wide uppercase"
          >
            Start from the workbench
          </p>
          <h2
            class="text-surface-900 dark:text-surface-50 text-3xl font-bold tracking-tight md:text-4xl"
          >
            Clone a Vue app that already knows its boundaries.
          </h2>
          <p class="text-surface-600 dark:text-surface-400 mt-4 max-w-2xl text-lg leading-relaxed">
            Provider adapters, theme tokens, auth scaffolding, query keys, docs, and tests are in
            place before the first product screen is yours.
          </p>
        </div>

        <div class="space-y-5 lg:justify-self-end">
          <div
            class="border-surface-200/80 bg-surface-50/90 dark:border-surface-700 dark:bg-surface-950/78 rounded-[calc(var(--shape-radius)+0.125rem)] border p-5 shadow-(--shadow-soft)"
          >
            <ul class="text-surface-600 dark:text-surface-400 grid gap-2 text-sm">
              <li class="flex items-center gap-2">
                <span
                  :class="[
                    resolveIcon('check-circle'),
                    'text-primary-600 dark:text-primary-400 h-4 w-4',
                  ]"
                />
                Runtime UI provider switching
              </li>
              <li class="flex items-center gap-2">
                <span
                  :class="[
                    resolveIcon('check-circle'),
                    'text-primary-600 dark:text-primary-400 h-4 w-4',
                  ]"
                />
                Ten themes with light and dark modes
              </li>
              <li class="flex items-center gap-2">
                <span
                  :class="[
                    resolveIcon('check-circle'),
                    'text-primary-600 dark:text-primary-400 h-4 w-4',
                  ]"
                />
                Unit, integration, and Playwright coverage
              </li>
            </ul>
          </div>

          <div class="flex flex-wrap gap-3">
            <UiButton to="/docs/getting-started/installation" variant="primary" size="lg">
              <span :class="[resolveIcon('rocket'), 'h-5 w-5']" />
              Install Vuestrata
            </UiButton>
            <UiButton
              href="https://github.com/boussadjra/vuestrata"
              target="_blank"
              rel="noopener noreferrer"
              variant="ghost"
              size="lg"
            >
              <span class="i-simple-icons-github h-5 w-5" />
              View source
            </UiButton>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
