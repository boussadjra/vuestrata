<script setup lang="ts">
import { Comark } from 'comark/vue'

import { docsComarkPlugins } from '@/config/comark'

const props = defineProps<{
  title?: string
  code: string
}>()

const activeTab = ref<'preview' | 'code'>('preview')
const codeMarkdown = computed(() => `\`\`\`vue\n${props.code.trim()}\n\`\`\``)
</script>

<template>
  <div class="border-surface-200 dark:border-surface-700/60 overflow-hidden rounded-xl border">
    <div
      class="border-surface-200 dark:border-surface-700/60 bg-surface-50 dark:bg-surface-800/50 flex items-center justify-between border-b px-4 py-2"
    >
      <span v-if="title" class="text-surface-500 dark:text-surface-400 text-xs font-medium">{{
        title
      }}</span>
      <span v-else />
      <div
        class="border-surface-200 dark:border-surface-700 bg-surface-100 dark:bg-surface-800 inline-flex rounded-lg border p-0.5"
      >
        <button
          :class="[
            'rounded-md px-3 py-1 text-xs font-medium transition-colors',
            activeTab === 'preview'
              ? 'dark:bg-surface-900 text-surface-900 bg-white shadow-sm dark:text-white'
              : 'text-surface-500 hover:text-surface-700 dark:text-surface-400',
          ]"
          @click="activeTab = 'preview'"
        >
          Preview
        </button>
        <button
          :class="[
            'rounded-md px-3 py-1 text-xs font-medium transition-colors',
            activeTab === 'code'
              ? 'dark:bg-surface-900 text-surface-900 bg-white shadow-sm dark:text-white'
              : 'text-surface-500 hover:text-surface-700 dark:text-surface-400',
          ]"
          @click="activeTab = 'code'"
        >
          Code
        </button>
      </div>
    </div>
    <div v-if="activeTab === 'preview'" class="dark:bg-surface-900 bg-white p-6">
      <slot />
    </div>
    <div
      v-else
      class="docs-content bg-surface-50 dark:bg-surface-950 overflow-x-auto p-4 text-sm [&_pre]:!m-0 [&_pre]:!rounded-lg"
    >
      <Comark :markdown="codeMarkdown" :plugins="docsComarkPlugins" />
    </div>
  </div>
</template>
