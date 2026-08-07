<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { UiButton } from '@/components/ui'
import { resolveIcon } from '@/config/icon-provider'

const { t } = useI18n()

const ctaSectionLabel = computed(() => t('cta_section_label'))
const ctaSectionTitle = computed(() => t('cta_section_title'))
const ctaSectionDesc = computed(() => t('cta_section_desc'))
const ctaFeature1 = computed(() => t('cta_feature_1'))
const ctaFeature2 = computed(() => t('cta_feature_2'))
const ctaFeature3 = computed(() => t('cta_feature_3'))
const ctaInstallButton = computed(() => t('cta_install_button'))
const ctaSourceButton = computed(() => t('cta_source_button'))
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
            {{ ctaSectionLabel }}
          </p>
          <h2 class="text-foreground text-3xl font-bold tracking-tight md:text-4xl">
            {{ ctaSectionTitle }}
          </h2>
          <p class="text-muted-foreground mt-4 max-w-2xl text-lg leading-relaxed">
            {{ ctaSectionDesc }}
          </p>
        </div>

        <div class="space-y-5 lg:justify-self-end">
          <div
            class="border-surface-200/80 bg-surface-50/90 dark:border-surface-700 dark:bg-surface-950/78 rounded-[calc(var(--shape-radius)+0.125rem)] border p-5 shadow-(--shadow-soft)"
          >
            <ul class="text-muted-foreground grid gap-2 text-sm">
              <li class="flex items-center gap-2">
                <span
                  :class="[
                    resolveIcon('check-circle'),
                    'text-primary-600 dark:text-primary-400 h-4 w-4',
                  ]"
                />
                {{ ctaFeature1 }}
              </li>
              <li class="flex items-center gap-2">
                <span
                  :class="[
                    resolveIcon('check-circle'),
                    'text-primary-600 dark:text-primary-400 h-4 w-4',
                  ]"
                />
                {{ ctaFeature2 }}
              </li>
              <li class="flex items-center gap-2">
                <span
                  :class="[
                    resolveIcon('check-circle'),
                    'text-primary-600 dark:text-primary-400 h-4 w-4',
                  ]"
                />
                {{ ctaFeature3 }}
              </li>
            </ul>
          </div>

          <div class="flex flex-wrap gap-3">
            <UiButton to="/docs/getting-started/installation" variant="primary" size="lg">
              <span :class="[resolveIcon('rocket'), 'h-5 w-5']" />
              {{ ctaInstallButton }}
            </UiButton>
            <UiButton
              href="https://github.com/boussadjra/vuestrata"
              target="_blank"
              rel="noopener noreferrer"
              variant="ghost"
              size="lg"
            >
              <span class="i-simple-icons-github h-5 w-5" />
              {{ ctaSourceButton }}
            </UiButton>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
