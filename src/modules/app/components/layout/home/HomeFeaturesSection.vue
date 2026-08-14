<script setup lang="ts">
import { useI18n } from 'vue-i18n'

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

const { t } = useI18n()

const FEATURE_ICON_CLASSES = [
  'border-primary-200 bg-primary-50 text-primary-700 dark:border-primary-800 dark:bg-primary-950/40 dark:text-primary-300',
  'border-accent-200 bg-accent-50 text-accent-700 dark:border-accent-800 dark:bg-accent-950/30 dark:text-accent-300',
  'border-secondary-200 bg-secondary-50 text-secondary-800 dark:border-secondary-800 dark:bg-secondary-950/40 dark:text-secondary-200',
  'border-primary-300 bg-surface-50 text-primary-700 dark:border-primary-700 dark:bg-surface-950 dark:text-primary-300',
] as const
</script>

<template>
  <section class="relative py-20 lg:py-24">
    <div
      class="from-primary-50/60 dark:from-primary-950/12 pointer-events-none absolute inset-x-0 top-0 h-32 bg-linear-to-b to-transparent"
      aria-hidden="true"
    />

    <div class="mx-auto max-w-7xl px-5 sm:px-8">
      <div class="mb-12 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-end">
        <div class="max-w-3xl">
          <p
            class="text-primary-600 dark:text-primary-400 mb-3 text-sm font-semibold tracking-wide uppercase"
          >
            {{ t('features_section_label') }}
          </p>
          <h2 class="text-foreground mb-4 text-3xl font-bold tracking-tight md:text-4xl">
            {{ t('features_section_title') }}
          </h2>
          <p class="text-muted-foreground text-lg leading-8">
            {{ t('features_section_desc') }}
          </p>
        </div>

        <!-- `text-muted-foreground`, not `text-surface-500`. This is 14px body
             copy, so it needs 4.5:1 on whatever surface it lands on, and the
             ramp step that satisfies that is theme-dependent: surface-500
             measured 3.98:1 on Blueprint light, 3.91:1 on the default dark ramp
             and 1.36:1 on Terminal. `muted-foreground` is the token defined to
             clear AA in both modes on every theme. -->
        <div
          class="border-surface-200/80 bg-surface-50/82 dark:border-surface-800 dark:bg-surface-900/68 text-muted-foreground rounded-[calc(var(--shape-radius)+0.125rem)] border px-4 py-3 text-sm shadow-(--shadow-soft)"
        >
          {{ t('features_section_note') }}
        </div>
      </div>

      <ol class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
        <li
          v-for="(feature, featureIndex) in features"
          :key="feature.title"
          class="border-surface-200/80 bg-surface-50/88 dark:border-surface-800 dark:bg-surface-900/82 animate-slide-up group hover:border-primary-200 dark:hover:border-primary-700/70 relative overflow-hidden rounded-[calc(var(--shape-radius)+0.25rem)] border p-6 shadow-(--shadow-soft) transition-[transform,border-color,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:shadow-(--shadow-card-hover) lg:p-7"
          :class="featureIndex === 0 || featureIndex === 3 ? 'lg:col-span-7' : 'lg:col-span-5'"
          :style="{ animationDelay: `${0.1 + featureIndex * 0.08}s` }"
        >
          <div class="mb-8 flex items-start justify-between gap-4">
            <div class="flex items-center gap-3">
              <div
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-transform duration-200 group-hover:-translate-y-0.5"
                :class="FEATURE_ICON_CLASSES[featureIndex]"
              >
                <span :class="[resolveIcon(feature.iconName), 'h-5 w-5']" aria-hidden="true" />
              </div>
              <span class="text-muted-foreground font-mono text-xs">
                {{ String(featureIndex + 1).padStart(2, '0') }}
              </span>
            </div>

            <span
              class="i-solar-arrow-right-up-linear text-surface-300 dark:text-surface-600 h-5 w-5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              aria-hidden="true"
            />
          </div>

          <h3 class="text-foreground mb-2 text-xl font-semibold tracking-tight">
            {{ feature.title }}
          </h3>
          <p class="text-muted-foreground max-w-xl text-base leading-relaxed">
            {{ feature.desc }}
          </p>
        </li>
      </ol>
    </div>
  </section>
</template>
