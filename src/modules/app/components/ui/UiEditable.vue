<script setup lang="ts">
import { useUiEditable, type EditableProps } from '@/composables/forms'

const props = withDefaults(defineProps<EditableProps>(), { size: 'md' })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const {
  fieldValue,
  setValue,
  isEditing,
  startEditing,
  stopEditing,
  labelProps,
  errorMessageProps,
  descriptionProps,
  displayError,
} = useUiEditable(props)

function onInput(e: Event) {
  const target = e.target as HTMLInputElement
  setValue(target.value)
  emit('update:modelValue', target.value)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') stopEditing()
  if (e.key === 'Escape') stopEditing()
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
    </label>

    <div data-provider="reka" data-ui="editable">
      <input
        v-if="isEditing"
        :value="fieldValue"
        :placeholder="placeholder"
        class="border-primary-300 focus:ring-primary-300 rounded border px-2 py-1 text-sm focus:ring-2 focus:outline-none"
        autofocus
        @input="onInput"
        @blur="stopEditing"
        @keydown="onKeydown"
      />
      <span
        v-else
        class="hover:bg-surface-100 dark:hover:bg-surface-700 inline-block cursor-pointer rounded px-2 py-1 text-sm"
        :class="{ 'cursor-not-allowed opacity-50': disabled }"
        @click="startEditing"
      >
        {{ fieldValue || placeholder || 'Click to edit' }}
      </span>
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
