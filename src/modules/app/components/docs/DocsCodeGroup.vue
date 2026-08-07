<script setup lang="ts">
import { UiButton } from '@/components/ui'

interface CodeTab {
  label: string
}

const bodyRef = ref<HTMLElement | null>(null)
const tabs = ref<CodeTab[]>([])
const activeTab = ref(0)

function syncVisibleBlocks() {
  if (!bodyRef.value) return

  const blocks = [...bodyRef.value.querySelectorAll<HTMLElement>('pre')]
  blocks.forEach((block, index) => {
    block.style.display = index === activeTab.value ? 'block' : 'none'
  })
}

function setupTabs() {
  if (!bodyRef.value) return

  const blocks = [...bodyRef.value.querySelectorAll<HTMLElement>('pre')]
  tabs.value = blocks.map((block, index) => ({
    label: block.getAttribute('filename') || block.getAttribute('language') || `Code ${index + 1}`,
  }))

  if (activeTab.value >= tabs.value.length) activeTab.value = 0

  syncVisibleBlocks()
}

onMounted(async () => {
  await nextTick()
  setupTabs()
})

watch(activeTab, () => {
  syncVisibleBlocks()
})
</script>

<template>
  <div
    class="docs-code-group border-surface-200/80 dark:border-surface-700/80 bg-surface-50/70 dark:bg-surface-900/70 my-6 overflow-hidden rounded-2xl border"
  >
    <div
      class="border-surface-200/80 dark:border-surface-700/80 bg-surface-50/80 dark:bg-surface-900/80 flex flex-wrap items-center gap-2 border-b px-3 py-3"
    >
      <span v-if="tabs.length <= 1" class="text-muted-foreground px-2 text-xs font-medium">
        {{ tabs[0]?.label ?? 'Code sample' }}
      </span>
      <div v-else class="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        <UiButton
          v-for="(tab, index) in tabs"
          :key="tab.label"
          :variant="activeTab === index ? 'secondary' : 'ghost'"
          size="sm"
          class="rounded-full whitespace-nowrap"
          @click="activeTab = index"
        >
          {{ tab.label }}
        </UiButton>
      </div>
    </div>
    <div ref="bodyRef" class="docs-code-group-body">
      <slot />
    </div>
  </div>
</template>
