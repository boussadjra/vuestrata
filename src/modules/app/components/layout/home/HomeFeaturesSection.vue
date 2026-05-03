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

      <!--
        Bento grid (4 features): row 1 = wide(col-span-2) + narrow, row 2 = narrow + wide(col-span-2).
        Wide cards use a horizontal layout; narrow cards use a compact vertical layout.
      -->
      <div class="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div
          v-for="(f, i) in features"
          :key="f.title"
          class="group border-surface-200/80 dark:border-surface-700/50 dark:bg-surface-900 hover:shadow-elevated animate-slide-up relative overflow-hidden rounded-2xl border bg-white transition-all duration-300 hover:-translate-y-0.5"
          :class="i === 0 || i === 3 ? 'p-9 sm:col-span-2 lg:p-11' : 'p-7 sm:col-span-1 lg:p-8'"
          :style="{ animationDelay: `${0.1 + i * 0.08}s` }"
        >
          <!-- Wide card: horizontal layout -->
          <template v-if="i === 0 || i === 3">
            <div class="flex items-center gap-6">
              <div
                class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-105"
                :class="f.bg"
              >
                <span :class="[resolveIcon(f.iconName), 'h-7 w-7', f.text]" />
              </div>
              <div>
                <h3 class="text-surface-900 dark:text-surface-100 mb-2 text-xl font-semibold">
                  {{ f.title }}
                </h3>
                <p
                  class="text-surface-500 dark:text-surface-400 max-w-sm text-base leading-relaxed"
                >
                  {{ f.desc }}
                </p>
              </div>
            </div>
          </template>

          <!-- Narrow card: vertical layout -->
          <template v-else>
            <div
              class="mb-5 flex h-11 w-11 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
              :class="f.bg"
            >
              <span :class="[resolveIcon(f.iconName), 'h-5 w-5', f.text]" />
            </div>
            <h3 class="text-surface-900 dark:text-surface-100 mb-1.5 text-lg font-semibold">
              {{ f.title }}
            </h3>
            <p class="text-surface-500 dark:text-surface-400 text-base leading-relaxed">
              {{ f.desc }}
            </p>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>
