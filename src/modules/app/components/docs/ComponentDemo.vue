<script setup lang="ts">
import { Comark } from 'comark/vue'

import { UiToggleGroup } from '@/components/ui'
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
      <UiToggleGroup
        :model-value="activeTab"
        :options="[
          { label: 'Preview', value: 'preview' },
          { label: 'Code', value: 'code' },
        ]"
        size="sm"
        @update:model-value="(value) => (activeTab = value as 'preview' | 'code')"
      />
    </div>
    <div v-if="activeTab === 'preview'" class="bg-surface-50 dark:bg-surface-900 p-6">
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
