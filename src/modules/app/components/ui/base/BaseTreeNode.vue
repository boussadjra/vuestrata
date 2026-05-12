<script setup lang="ts">
import type { TreeNode } from '@/components/ui/base'

const props = defineProps<{
  provider: 'reka' | 'vuetify0'
  node: TreeNode
  level: number
  isExpanded: (value: string) => boolean
  isSelected: (value: string) => boolean
  toggleExpand: (value: string) => void
  selectNode: (value: string) => void
}>()

const nodeClasses = computed(() => [
  'flex cursor-pointer items-center gap-1 px-2 py-1.5 text-sm select-none',
  props.provider === 'reka' ? 'rounded-md' : 'rounded',
  'hover:bg-surface-100 dark:hover:bg-surface-700',
  props.isSelected(props.node.value)
    ? 'bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
    : 'text-surface-700 dark:text-surface-200',
  props.node.disabled ? 'pointer-events-none opacity-40' : '',
])
</script>

<template>
  <div :data-provider="provider">
    <div
      :class="nodeClasses"
      :style="{ paddingLeft: `${level * 16 + 8}px` }"
      role="treeitem"
      :aria-expanded="node.children?.length ? isExpanded(node.value) : undefined"
      :aria-selected="isSelected(node.value)"
      @click.stop="selectNode(node.value)"
    >
      <button
        v-if="node.children?.length"
        type="button"
        class="text-surface-400 flex h-4 w-4 flex-shrink-0 items-center justify-center text-xs"
        @click.stop="toggleExpand(node.value)"
      >
        {{ isExpanded(node.value) ? '▼' : '▶' }}
      </button>
      <span v-else class="w-4" />
      <span class="truncate">{{ node.label }}</span>
    </div>

    <div v-if="node.children?.length && isExpanded(node.value)" role="group">
      <BaseTreeNode
        v-for="child in node.children"
        :key="child.value"
        :provider="provider"
        :node="child"
        :level="level + 1"
        :is-expanded="isExpanded"
        :is-selected="isSelected"
        :toggle-expand="toggleExpand"
        :select-node="selectNode"
      />
    </div>
  </div>
</template>

<script lang="ts">
export default { name: 'BaseTreeNode' }
</script>
