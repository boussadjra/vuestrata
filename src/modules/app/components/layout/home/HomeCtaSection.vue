<script setup lang="ts">
import { resolveIcon } from '@/config/icon-provider'
</script>

<template>
  <section class="bg-surface-50 dark:bg-surface-950 py-20 lg:py-24">
    <div class="mx-auto max-w-7xl px-5 sm:px-8">
      <div
        class="border-surface-200 dark:border-surface-800 grid gap-8 border-y py-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-12"
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

          <div class="flex flex-wrap gap-3">
            <RouterLink
              to="/docs/getting-started/installation"
              class="bg-primary-500 hover:bg-primary-600 focus-visible:ring-primary-300/30 dark:focus-visible:ring-offset-surface-900 text-surface-50 inline-flex min-h-11 items-center gap-2 rounded-lg px-6 py-3 font-semibold shadow-(--shadow-soft) transition-all duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <span :class="[resolveIcon('rocket'), 'h-5 w-5']" />
              Install Vuestrata
            </RouterLink>
            <a
              href="https://github.com/boussadjra/vuestrata"
              target="_blank"
              rel="noopener noreferrer"
              class="border-surface-200 dark:border-surface-700 bg-surface-50 text-surface-700 hover:border-primary-300 hover:bg-surface-100 dark:bg-surface-900 dark:text-surface-200 dark:hover:border-primary-700 dark:hover:bg-surface-800 focus-visible:ring-primary-300/30 dark:focus-visible:ring-offset-surface-900 inline-flex min-h-11 items-center gap-2 rounded-lg border px-6 py-3 font-semibold transition-all duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <span class="i-simple-icons-github h-5 w-5" />
              View source
            </a>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
