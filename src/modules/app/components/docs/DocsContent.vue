<script setup lang="ts">
import { Comark } from 'comark/vue'

import { UiButton } from '@/components/ui'
import { docsComarkComponents, docsComarkPlugins } from '@/config/comark'

import type { DocEntry } from './docsNavigation'

defineProps<{
  doc?: DocEntry
}>()

const emit = defineEmits<{ back: [] }>()
</script>

<template>
  <main
    class="bg-surface-50/60 dark:bg-surface-950 min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-8 sm:px-6 lg:px-4"
  >
    <article v-if="doc" class="docs-content dark:border-surface-800 mx-auto max-w-6xl rounded py-8">
      <Suspense>
        <component v-if="doc.component" :is="doc.component" />
        <Comark
          v-else
          :markdown="doc.content"
          :components="docsComarkComponents"
          :plugins="docsComarkPlugins"
        />
        <template #fallback>
          <div class="text-surface-400 flex items-center gap-2 py-12">
            <span class="i-solar-refresh-bold-duotone h-5 w-5 animate-spin" />
            Loading...
          </div>
        </template>
      </Suspense>
    </article>

    <div v-else class="mx-auto max-w-xl py-20 text-center">
      <p class="text-surface-900 dark:text-surface-100 text-lg font-semibold">
        This docs route is not indexed.
      </p>
      <p class="text-surface-500 dark:text-surface-400 mt-2 text-sm leading-6">
        The markdown registry has no entry for this URL.
      </p>
      <UiButton variant="ghost" size="md" class="mt-5" @click="emit('back')">
        Back to docs
      </UiButton>
    </div>
  </main>
</template>
