<script setup lang="ts">
import { resolveIcon } from '@/config/icon-provider'
import type { IconName } from '@/types'

type FeatureItem = {
  iconName: IconName
  title: string
  desc: string
}

defineProps<{
  features: FeatureItem[]
}>()

const FEATURE_ICON_CLASSES = [
  'border-primary-200 bg-primary-50 text-primary-700 dark:border-primary-800 dark:bg-primary-950/40 dark:text-primary-300',
  'border-accent-200 bg-accent-50 text-accent-700 dark:border-accent-800 dark:bg-accent-950/30 dark:text-accent-300',
  'border-secondary-200 bg-secondary-50 text-secondary-800 dark:border-secondary-800 dark:bg-secondary-950/40 dark:text-secondary-200',
  'border-primary-300 bg-surface-50 text-primary-700 dark:border-primary-700 dark:bg-surface-950 dark:text-primary-300',
] as const
</script>

<template>
  <section class="bg-surface-50 dark:bg-surface-950 relative py-24 lg:py-32">
    <div class="mx-auto max-w-7xl px-5 sm:px-8">
      <div class="mb-16 max-w-2xl">
        <p
          class="text-primary-600 dark:text-primary-400 mb-3 text-sm font-semibold tracking-wide uppercase"
        >
          System defaults
        </p>
        <h2
          class="text-surface-900 dark:text-surface-50 mb-4 text-3xl font-bold tracking-tight md:text-4xl"
        >
          The parts that usually drift are already wired.
        </h2>
        <p class="text-surface-500 dark:text-surface-400 text-lg">
          Vuestrata keeps the starter honest: toolchain, data boundaries, theming, and auth all
          share one source of truth.
        </p>
      </div>

      <ol class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
        <li
          v-for="(feature, featureIndex) in features"
          :key="feature.title"
          class="border-surface-200/80 bg-surface-50 dark:border-surface-700/60 dark:bg-surface-900 animate-slide-up group hover:border-primary-300 dark:hover:border-primary-700 relative overflow-hidden rounded-xl border p-6 transition-colors duration-200 lg:p-7"
          :class="featureIndex === 0 || featureIndex === 3 ? 'lg:col-span-7' : 'lg:col-span-5'"
          :style="{ animationDelay: `${0.1 + featureIndex * 0.08}s` }"
        >
          <div class="mb-8 flex items-center justify-between gap-4">
            <div
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border transition-transform duration-200 group-hover:-translate-y-0.5"
              :class="FEATURE_ICON_CLASSES[featureIndex]"
            >
              <span :class="[resolveIcon(feature.iconName), 'h-5 w-5']" aria-hidden="true" />
            </div>
            <span class="text-surface-400 dark:text-surface-500 font-mono text-xs">
              {{ String(featureIndex + 1).padStart(2, '0') }}
            </span>
          </div>

          <h3 class="text-surface-900 dark:text-surface-100 mb-2 text-xl font-semibold">
            {{ feature.title }}
          </h3>
          <p class="text-surface-600 dark:text-surface-400 max-w-xl text-base leading-relaxed">
            {{ feature.desc }}
          </p>
        </li>
      </ol>
    </div>
  </section>
</template>
