<script setup lang="ts">
import { useBaseTreeSelect, type TreeSelectProps } from '@/components/ui/base'

import V0TreeNode from './V0TreeNode.vue'

const props = withDefaults(defineProps<TreeSelectProps>(), {
  placeholder: 'Select...',
  size: 'md',
})
defineEmits<{ 'update:modelValue': [value: string | string[]] }>()

const {
  labelProps,
  errorMessageProps,
  descriptionProps,
  displayError,
  toggleExpand,
  isExpanded,
  selectNode,
  isSelected,
  fieldValue,
} = useBaseTreeSelect(props)
const isOpen = ref(false)

function findLabel(value: string, nodes: typeof props.nodes): string | undefined {
  for (const node of nodes) {
    if (node.value === value) return node.label
    if (node.children) {
      const found = findLabel(value, node.children)
      if (found) return found
    }
  }
  return undefined
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <label
      v-if="label"
      v-bind="labelProps"
      class="text-surface-700 dark:text-surface-300 text-sm font-medium"
    >
      {{ label }}
      <span v-if="required" class="ml-0.5 text-red-500">*</span>
    </label>

    <div class="relative">
      <button
        type="button"
        :class="[
          'inline-flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm',
          'text-surface-700 dark:bg-surface-800 dark:text-surface-200 bg-white',
          displayError
            ? 'border-red-400 focus:ring-red-300 dark:border-red-500'
            : 'border-surface-300 dark:border-surface-600',
          'focus:ring-primary-300 focus:ring-2 focus:outline-none',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'min-w-[180px]',
        ]"
        data-ui="tree-select"
        data-provider="vuetify0"
        @click="isOpen = !isOpen"
      >
        <span v-if="fieldValue && !Array.isArray(fieldValue)" class="truncate">
          {{ findLabel(fieldValue as string, nodes) ?? fieldValue }}
        </span>
        <span v-else-if="Array.isArray(fieldValue) && fieldValue.length" class="truncate">
          {{ fieldValue.length }} selected
        </span>
        <span v-else class="text-surface-400 truncate">{{ placeholder }}</span>
        <span class="text-surface-400 ml-2 text-xs">▼</span>
      </button>

      <div
        v-show="isOpen"
        class="border-surface-200 dark:border-surface-700 dark:bg-surface-800 shadow-elevated absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border bg-white py-1"
        role="tree"
      >
        <V0TreeNode
          v-for="node in nodes"
          :key="node.value"
          :node="node"
          :level="0"
          :is-expanded="isExpanded"
          :is-selected="isSelected"
          :toggle-expand="toggleExpand"
          :select-node="selectNode"
        />
      </div>
    </div>

    <p v-if="displayError" v-bind="errorMessageProps" class="text-xs text-red-500" role="alert">
      {{ displayError }}
    </p>
    <p
      v-else-if="hint || description"
      v-bind="descriptionProps"
      class="text-surface-500 dark:text-surface-400 text-xs"
    >
      {{ hint || description }}
    </p>
  </div>
</template>
