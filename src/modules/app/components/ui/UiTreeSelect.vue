<script setup lang="ts">
import { PopoverContent, PopoverRoot, PopoverTrigger, TreeItem, TreeRoot } from 'reka-ui'
import { useI18n } from 'vue-i18n'

import { useUiTreeSelect, type TreeSelectProps } from '@/composables/forms'

const props = withDefaults(defineProps<TreeSelectProps>(), {
  size: 'md',
})

const emit = defineEmits<{ 'update:modelValue': [value: string | string[]] }>()
const { t } = useI18n()

const { labelProps, errorMessageProps, descriptionProps, displayError, fieldValue, setValue } =
  useUiTreeSelect(props)

const isOpen = ref(false)
const placeholderText = computed(() => props.placeholder ?? t('common_select'))

const expanded = ref<string[]>([])

function findNode(
  value: string,
  nodes: typeof props.nodes,
): (typeof props.nodes)[number] | undefined {
  for (const node of nodes) {
    if (node.value === value) return node

    if (node.children) {
      const nestedNode = findNode(value, node.children)
      if (nestedNode) return nestedNode
    }
  }

  return undefined
}

const selectedValue = computed(() => {
  if (props.multiple) {
    const values = Array.isArray(fieldValue.value)
      ? fieldValue.value
      : Array.isArray(props.modelValue)
        ? props.modelValue
        : []

    return values
      .map((value) => findNode(value, props.nodes))
      .filter((node): node is NonNullable<typeof node> => Boolean(node))
  }

  const value = Array.isArray(fieldValue.value)
    ? fieldValue.value[0]
    : typeof fieldValue.value === 'string'
      ? fieldValue.value
      : typeof props.modelValue === 'string'
        ? props.modelValue
        : undefined

  return value ? findNode(value, props.nodes) : undefined
})

const selectedLabels = computed(() => {
  if (Array.isArray(selectedValue.value)) return selectedValue.value.map((node) => node.label)

  return selectedValue.value ? [selectedValue.value.label] : []
})

function onTreeValueChange(
  value: (typeof props.nodes)[number] | (typeof props.nodes)[number][] | undefined,
) {
  if (Array.isArray(value)) {
    const nextValue = value.map((node) => node.value)
    setValue(nextValue)
    emit('update:modelValue', nextValue)
    return
  }

  if (!value) return

  setValue(value.value)
  emit('update:modelValue', value.value)
  isOpen.value = false
}

function handleTreeSelect(event: Event & { detail?: { originalEvent?: Event } }) {
  const originalEvent = event.detail?.originalEvent

  if (originalEvent?.type === 'click') {
    event.preventDefault()
  }
}

function handleTreeToggle(event: Event & { detail?: { originalEvent?: Event } }) {
  const originalEvent = event.detail?.originalEvent

  if (originalEvent?.type === 'click') {
    event.preventDefault()
  }
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

    <PopoverRoot v-model:open="isOpen">
      <PopoverTrigger as-child>
        <button
          type="button"
          :class="[
            'shaped-border shaped-radius-sm inline-flex w-full items-center justify-between border px-3 py-2 text-sm',
            'text-surface-700 dark:bg-surface-800 dark:text-surface-200 bg-white',
            displayError
              ? 'border-red-400 focus:ring-red-300 dark:border-red-500'
              : 'border-surface-300 dark:border-surface-600',
            'focus:ring-primary-300 focus:ring-2 focus:outline-none',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'min-w-45',
          ]"
          data-ui="tree-select"
          data-provider="reka"
        >
          <span v-if="!props.multiple && selectedLabels.length" class="truncate">
            {{ selectedLabels[0] }}
          </span>
          <span v-else-if="props.multiple && selectedLabels.length" class="truncate">
            {{ selectedLabels.length }} {{ t('common_selected') }}
          </span>
          <span v-else class="text-surface-400 truncate">{{ placeholderText }}</span>
          <span class="text-surface-400 ml-2 text-xs">▼</span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        class="shaped-border shaped-radius shaped-shadow border-surface-200 dark:border-surface-700 dark:bg-surface-800 z-50 max-h-60 w-[var(--reka-popover-trigger-width)] overflow-auto border bg-white py-1"
        align="start"
        :side-offset="6"
      >
        <TreeRoot
          v-slot="{ flattenItems }"
          :items="nodes"
          :model-value="selectedValue"
          :expanded="expanded"
          :multiple="multiple"
          :disabled="disabled"
          :get-key="(node) => node.value"
          @update:model-value="onTreeValueChange"
          @update:expanded="expanded = $event"
        >
          <TreeItem
            v-for="item in flattenItems"
            :key="item._id"
            v-bind="item.bind"
            v-slot="{ handleSelect, handleToggle, isExpanded, isSelected }"
            @select="handleTreeSelect"
            @toggle="handleTreeToggle"
          >
            <div
              class="hover:bg-surface-100 dark:hover:bg-surface-700 flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-sm select-none"
              :class="{
                'bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400':
                  isSelected,
                'text-surface-700 dark:text-surface-200': !isSelected,
                'pointer-events-none opacity-40': item.value.disabled,
              }"
              :style="{ paddingLeft: `${(item.level - 1) * 16 + 8}px` }"
              @click.stop="handleSelect()"
            >
              <button
                v-if="item.hasChildren"
                type="button"
                class="text-surface-400 flex h-4 w-4 flex-shrink-0 items-center justify-center text-xs"
                @click.stop="handleToggle()"
              >
                {{ isExpanded ? '▼' : '▶' }}
              </button>
              <span v-else class="w-4" />
              <span class="truncate">{{ item.value.label }}</span>
            </div>
          </TreeItem>
        </TreeRoot>
      </PopoverContent>
    </PopoverRoot>

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
