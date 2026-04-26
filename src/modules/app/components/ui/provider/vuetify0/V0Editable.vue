<script setup lang="ts">
import { useBaseEditable, type EditableProps } from '@/components/ui/base'

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
} = useBaseEditable(props)

function onInput(e: Event) {
  const val = (e.target as HTMLInputElement).value
  setValue(val)
  emit('update:modelValue', val)
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <label v-if="label" v-bind="labelProps" class="text-sm font-medium">{{ label }}</label>
    <div data-provider="vuetify0" data-ui="editable">
      <input
        v-if="isEditing"
        :value="fieldValue"
        class="rounded border px-2 py-1 text-sm"
        autofocus
        @input="onInput"
        @blur="stopEditing"
        @keydown.enter="stopEditing"
        @keydown.escape="stopEditing"
      />
      <span v-else class="cursor-pointer text-sm" @click="startEditing">{{
        fieldValue || placeholder || 'Click to edit'
      }}</span>
    </div>
    <p v-if="displayError" v-bind="errorMessageProps" class="text-xs text-red-500" role="alert">
      {{ displayError }}
    </p>
    <p v-else-if="hint || description" v-bind="descriptionProps" class="text-surface-500 text-xs">
      {{ hint || description }}
    </p>
  </div>
</template>
