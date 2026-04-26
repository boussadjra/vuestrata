<script setup lang="ts">
import { resolveIcon } from '@/config/icon-provider'
</script>

<template>
  <section class="bg-surface-50 dark:bg-surface-950 relative overflow-hidden py-24 lg:py-32">
    <div class="pointer-events-none absolute inset-0" aria-hidden="true">
      <div
        class="border-primary-300/20 dark:border-primary-700/15 animate-float absolute top-12 left-[10%] h-14 w-14 rotate-12 rounded-lg border"
      />
      <div
        class="border-secondary-300/20 dark:border-secondary-700/15 animate-float absolute right-[12%] bottom-16 h-10 w-10 rounded-full border"
        style="animation-delay: -2s"
      />
      <div
        class="bg-accent-300/15 dark:bg-accent-700/10 animate-float absolute top-1/2 left-[4%] h-7 w-7 rotate-45 rounded-md"
        style="animation-delay: -4s"
      />
    </div>

    <div class="relative z-10 mx-auto max-w-2xl px-5 text-center">
      <h2 class="text-surface-900 dark:text-surface-50 mb-4 text-3xl font-bold md:text-4xl">
        Ready to build something great?
      </h2>
      <p class="text-surface-500 dark:text-surface-400 mb-10 text-lg">
        Get started with Vuestrata and focus on what matters — your product.
      </p>
      <div class="flex flex-wrap justify-center gap-3">
        <RouterLink
          to="/auth/register"
          class="from-primary-600 to-primary-500 shadow-primary-500/40 hover:shadow-primary-500/50 inline-flex items-center gap-2 rounded-xl bg-linear-to-r px-8 py-3.5 font-semibold text-white shadow-[0_2px_24px_-4px] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_32px_-4px] active:translate-y-0"
        >
          <span :class="[resolveIcon('rocket'), 'h-5 w-5']" />
          Get Started Free
        </RouterLink>
        <a
          href="https://github.com/boussadjra/vuestrata"
          target="_blank"
          rel="noopener noreferrer"
          class="border-surface-200 dark:border-surface-700 dark:bg-surface-800/60 text-surface-700 dark:text-surface-200 hover:border-surface-300 dark:hover:border-surface-600 dark:hover:bg-surface-800 inline-flex items-center gap-2 rounded-xl border bg-white/60 px-8 py-3.5 font-semibold backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-white active:translate-y-0"
        >
          <span class="i-simple-icons-github h-5 w-5" />
          Star on GitHub
        </a>
      </div>
    </div>
  </section>
</template>
