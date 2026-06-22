<script setup lang="ts">
import { EditableArea, EditableInput, EditablePreview, EditableRoot } from 'reka-ui'

import { useUiEditable, type EditableProps } from '@/composables/forms'

const props = withDefaults(defineProps<EditableProps>(), { size: 'md' })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const { fieldValue, setValue, labelProps, errorMessageProps, descriptionProps, displayError } =
  useUiEditable(props)

const { t } = useI18n()

const editablePlaceholder = computed(() => props.placeholder || t('common_click_to_edit'))

const previewValue = computed(() => fieldValue.value || editablePlaceholder.value)

function onValueChange(value: string) {
  setValue(value)
  emit('update:modelValue', value)
}

function startEditing(edit: () => void) {
  if (!props.disabled && !props.readonly) {
    edit()
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
    </label>

    <EditableRoot
      v-slot="{ edit }"
      :model-value="fieldValue ?? ''"
      :name="name"
      :disabled="disabled"
      :readonly="readonly"
      :required="required"
      :placeholder="editablePlaceholder"
      activation-mode="none"
      submit-mode="both"
      data-provider="reka"
      data-ui="editable"
      @update:model-value="onValueChange"
    >
      <EditableArea class="grid">
        <EditableInput
          class="border-primary-300 focus:ring-primary-300 rounded border px-2 py-1 text-sm focus:ring-2 focus:outline-none"
        />
        <EditablePreview
          class="hover:bg-surface-100 dark:hover:bg-surface-700 inline-block rounded px-2 py-1 text-sm"
          :class="{
            'cursor-not-allowed opacity-50': disabled,
            'cursor-pointer': !disabled && !readonly,
          }"
          @click="startEditing(edit)"
        >
          {{ previewValue }}
        </EditablePreview>
      </EditableArea>
    </EditableRoot>

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
