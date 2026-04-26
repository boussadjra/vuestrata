<script setup lang="ts">
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
    class="docs-code-group border-surface-200 dark:border-surface-700 dark:bg-surface-900 shadow-soft my-6 overflow-hidden rounded-2xl border bg-white"
  >
    <div
      class="border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/80 text-surface-500 dark:text-surface-400 flex items-center gap-2 border-b px-4 py-3 text-xs font-semibold tracking-[0.2em] uppercase"
    >
      <span class="h-2.5 w-2.5 rounded-full bg-red-400" />
      <span class="h-2.5 w-2.5 rounded-full bg-amber-400" />
      <span class="h-2.5 w-2.5 rounded-full bg-green-400" />
      <div class="ml-2 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        <button
          v-for="(tab, index) in tabs"
          :key="tab.label"
          :class="[
            'rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.18em] whitespace-nowrap transition-colors',
            activeTab === index
              ? 'text-surface-900 shadow-soft dark:bg-surface-800 bg-white dark:text-white'
              : 'text-surface-500 hover:text-surface-800 dark:text-surface-100 dark:hover:bg-surface-800/70 dark:hover:text-surface-200 hover:bg-white/70',
          ]"
          @click="activeTab = index"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>
    <div ref="bodyRef" class="docs-code-group-body">
      <slot />
    </div>
  </div>
</template>
