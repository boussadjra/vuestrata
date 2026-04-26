<script setup lang="ts">
import { resolveIcon } from '@/config/icon-provider'
import type { IconName } from '@/types'

type FeatureItem = {
  iconName: IconName
  title: string
  desc: string
  color: string
  bg: string
  text: string
  ring: string
}

defineProps<{
  features: FeatureItem[]
}>()
</script>

<template>
  <section class="bg-surface-50 dark:bg-surface-950 relative py-24 lg:py-32">
    <div class="mx-auto max-w-7xl px-5 sm:px-8">
      <div class="mb-16 max-w-2xl">
        <p
          class="text-primary-500 dark:text-primary-400 mb-3 text-sm font-semibold tracking-widest uppercase"
        >
          Features
        </p>
        <h2
          class="text-surface-900 dark:text-surface-50 mb-4 text-3xl font-bold tracking-tight md:text-4xl"
        >
          Everything you need,<br />nothing you don't
        </h2>
        <p class="text-surface-500 dark:text-surface-400 text-lg">
          Enterprise-grade patterns packaged in a lightweight, elegant starter — so you focus on
          your product.
        </p>
      </div>

      <div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div
          v-for="(f, i) in features"
          :key="f.title"
          class="group border-surface-200/80 dark:border-surface-700/50 dark:bg-surface-900 hover:shadow-elevated animate-slide-up relative overflow-hidden rounded-2xl border bg-white p-8 ring-0 ring-transparent transition-all duration-300 hover:-translate-y-0.5 lg:p-9"
          :class="f.ring"
          :style="{ animationDelay: `${0.1 + i * 0.08}s` }"
        >
          <div
            class="absolute inset-x-0 top-0 h-0.5 bg-linear-to-r opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            :class="f.color"
          />

          <div class="flex items-start gap-5">
            <div
              class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
              :class="f.bg"
            >
              <span :class="[resolveIcon(f.iconName), 'h-6 w-6', f.text]" />
            </div>
            <div>
              <h3 class="text-surface-900 dark:text-surface-100 mb-1.5 text-lg font-semibold">
                {{ f.title }}
              </h3>
              <p class="text-surface-500 dark:text-surface-400 text-[15px] leading-relaxed">
                {{ f.desc }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
