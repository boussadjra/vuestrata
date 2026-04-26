<script setup lang="ts">
import { useBaseTreeSelect, type TreeSelectProps } from '@/components/ui/base'

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
</script>

<template>
  <div class="flex flex-col gap-1">
    <label v-if="label" v-bind="labelProps" class="text-sm font-medium">
      {{ label }}
      <span v-if="required" class="ml-0.5 text-red-500">*</span>
    </label>
    <button
      type="button"
      class="w-full rounded border px-3 py-2 text-left text-sm"
      data-ui="tree-select"
      data-provider="vuetify0"
      @click="isOpen = !isOpen"
    >
      <span v-if="fieldValue && !Array.isArray(fieldValue)">{{ fieldValue }}</span>
      <span v-else-if="Array.isArray(fieldValue) && fieldValue.length"
        >{{ fieldValue.length }} selected</span
      >
      <span v-else class="text-surface-400">{{ placeholder }}</span>
    </button>
    <div
      v-show="isOpen"
      class="dark:bg-surface-800 max-h-60 overflow-auto rounded border bg-white p-1 shadow"
      role="tree"
    >
      <div v-for="node in nodes" :key="node.value" class="text-sm">
        <div
          :class="[
            'cursor-pointer px-3 py-1.5',
            isSelected(node.value) ? 'bg-primary-50 text-primary-600' : '',
          ]"
          @click="selectNode(node.value)"
        >
          <button
            v-if="node.children?.length"
            type="button"
            class="mr-1 text-xs"
            @click.stop="toggleExpand(node.value)"
          >
            {{ isExpanded(node.value) ? '▼' : '▶' }}
          </button>
          {{ node.label }}
        </div>
        <template v-if="node.children?.length && isExpanded(node.value)">
          <div
            v-for="child in node.children"
            :key="child.value"
            :class="[
              'cursor-pointer px-3 py-1.5 pl-6',
              isSelected(child.value) ? 'bg-primary-50 text-primary-600' : '',
            ]"
            @click="selectNode(child.value)"
          >
            {{ child.label }}
          </div>
        </template>
      </div>
    </div>
    <p v-if="displayError" v-bind="errorMessageProps" class="text-xs text-red-500" role="alert">
      {{ displayError }}
    </p>
    <p v-else-if="hint || description" v-bind="descriptionProps" class="text-surface-500 text-xs">
      {{ hint || description }}
    </p>
  </div>
</template>
