<script setup lang="ts">
import { Comark } from 'comark/vue'
import { useI18n } from 'vue-i18n'

import { UiButton } from '@/components/ui'
import { docsComarkComponents, docsComarkPlugins } from '@/config/comark'

import type { DocEntry } from './docsNavigation'

const { t } = useI18n()

defineProps<{
  doc?: DocEntry
}>()

const emit = defineEmits<{ back: [] }>()
</script>

<template>
  <main class="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
    <div class="mx-auto flex w-full max-w-6xl flex-col gap-6 py-2 lg:py-6">
      <section
        v-if="doc && (doc.description || doc.section)"
        class="border-surface-200/80 bg-surface-50/86 dark:border-surface-800 dark:bg-surface-900/78 rounded-[calc(var(--shape-radius)+0.25rem)] border px-5 py-4 shadow-[var(--shadow-soft)] sm:px-6 sm:py-5"
      >
        <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div class="min-w-0">
            <div
              class="text-muted-foreground flex flex-wrap items-center gap-2 text-[11px] font-medium tracking-[0.18em] uppercase"
            >
              <span>{{
                doc.section ? doc.section.replace(/-/g, ' ') : t('common_documentation')
              }}</span>
              <span
                v-if="doc.subsection || doc.subsectionLabel"
                class="bg-surface-300 dark:bg-surface-600 h-1 w-1 rounded-full"
              />
              <span v-if="doc.subsection || doc.subsectionLabel">
                {{ doc.subsectionLabel || doc.subsection?.replace(/-/g, ' ') }}
              </span>
            </div>
            <h1 class="text-foreground mt-3 text-3xl font-bold tracking-tight">
              {{ doc.title }}
            </h1>
            <p
              v-if="doc.description"
              class="text-muted-foreground mt-3 max-w-3xl text-sm leading-6 sm:text-base"
            >
              {{ doc.description }}
            </p>
          </div>

          <UiButton v-if="doc.slug" variant="ghost" size="sm" @click="emit('back')">
            Docs index
          </UiButton>
        </div>
      </section>

      <article
        v-if="doc"
        class="docs-content border-surface-200/80 bg-surface-50/78 dark:border-surface-800 dark:bg-surface-950/60 rounded-[calc(var(--shape-radius)+0.375rem)] border px-5 py-6 shadow-[var(--shadow-soft)] sm:px-8 sm:py-8 lg:px-10"
      >
        <Suspense>
          <component v-if="doc.component" :is="doc.component" />
          <Comark
            v-else
            :markdown="doc.content"
            :components="docsComarkComponents"
            :plugins="docsComarkPlugins"
          />
          <template #fallback>
            <div class="text-muted-foreground flex items-center gap-2 py-12">
              <span class="i-solar-refresh-bold-duotone h-5 w-5 animate-spin" />
              Loading...
            </div>
          </template>
        </Suspense>
      </article>

      <div
        v-else
        class="border-surface-200/80 bg-surface-50/86 dark:border-surface-800 dark:bg-surface-900/78 mx-auto max-w-xl rounded-[calc(var(--shape-radius)+0.25rem)] border px-6 py-12 text-center shadow-[var(--shadow-soft)]"
      >
        <p class="text-foreground text-lg font-semibold">This docs route is not indexed.</p>
        <p class="text-muted-foreground mt-2 text-sm leading-6">
          The markdown registry has no entry for this URL.
        </p>
        <UiButton variant="ghost" size="md" class="mt-5" @click="emit('back')">
          Back to docs
        </UiButton>
      </div>
    </div>
  </main>
</template>
