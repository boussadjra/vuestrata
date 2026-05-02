<script setup lang="ts">
import type { FormFieldDefinition } from '~/types'

import UiCheckbox from './UiCheckbox.vue'
import UiColorPicker from './UiColorPicker.vue'
import UiComboBox from './UiComboBox.vue'
import UiDateField from './UiDateField.vue'
import UiDatePicker from './UiDatePicker.vue'
import UiEditable from './UiEditable.vue'
import UiFileUpload from './UiFileUpload.vue'
import UiNumberField from './UiNumberField.vue'
import UiOTPField from './UiOTPField.vue'
import UiRadioGroup from './UiRadioGroup.vue'
import UiRatingField from './UiRatingField.vue'
import UiSearchField from './UiSearchField.vue'
import UiSelect from './UiSelect.vue'
import UiSlider from './UiSlider.vue'
import UiSwitch from './UiSwitch.vue'
import UiTagsField from './UiTagsField.vue'
import UiTextarea from './UiTextarea.vue'
import UiTextField from './UiTextField.vue'
import UiTimeField from './UiTimeField.vue'
import UiToggle from './UiToggle.vue'

export interface FormFieldProps {
  field: FormFieldDefinition & { error?: string }
  modelValue?: unknown
}

const props = defineProps<FormFieldProps>()
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()

const textTypes = new Set(['text', 'email', 'password', 'tel', 'url'])
</script>

<template>
  <UiTextField
    v-if="textTypes.has(field.type)"
    :model-value="modelValue as string | undefined"
    :type="field.type as 'text' | 'email' | 'password' | 'tel' | 'url'"
    :label="field.label"
    :placeholder="field.placeholder"
    :hint="field.hint"
    :error="field.error"
    :required="field.required"
    :disabled="field.disabled"
    :name="field.name"
    :size="field.size"
    @update:model-value="emit('update:modelValue', $event)"
  />

  <UiSearchField
    v-else-if="field.type === 'search'"
    :model-value="modelValue as string | undefined"
    :label="field.label"
    :placeholder="field.placeholder"
    :hint="field.hint"
    :error="field.error"
    :required="field.required"
    :disabled="field.disabled"
    :name="field.name"
    :size="field.size"
    @update:model-value="emit('update:modelValue', $event)"
  />

  <UiNumberField
    v-else-if="field.type === 'number'"
    :model-value="modelValue as number | undefined"
    :label="field.label"
    :placeholder="field.placeholder"
    :hint="field.hint"
    :error="field.error"
    :required="field.required"
    :disabled="field.disabled"
    :name="field.name"
    :size="field.size"
    @update:model-value="emit('update:modelValue', $event)"
  />

  <UiTextarea
    v-else-if="field.type === 'textarea'"
    :model-value="modelValue as string | undefined"
    :label="field.label"
    :placeholder="field.placeholder"
    :hint="field.hint"
    :error="field.error"
    :required="field.required"
    :disabled="field.disabled"
    :name="field.name"
    @update:model-value="emit('update:modelValue', $event)"
  />

  <UiSelect
    v-else-if="field.type === 'select'"
    :model-value="modelValue as string | undefined"
    :options="field.options ?? []"
    :label="field.label"
    :hint="field.hint"
    :error="field.error"
    :disabled="field.disabled"
    @update:model-value="emit('update:modelValue', $event)"
  />

  <UiCheckbox
    v-else-if="field.type === 'checkbox'"
    :model-value="modelValue as boolean | undefined"
    :label="field.label"
    :disabled="field.disabled"
    :name="field.name"
    @update:model-value="emit('update:modelValue', $event)"
  />

  <UiSwitch
    v-else-if="field.type === 'switch'"
    :model-value="modelValue as boolean | undefined"
    :label="field.label"
    :disabled="field.disabled"
    @update:model-value="emit('update:modelValue', $event)"
  />

  <UiToggle
    v-else-if="field.type === 'toggle'"
    :model-value="modelValue as boolean | undefined"
    :label="field.label"
    :disabled="field.disabled"
    :name="field.name"
    @update:model-value="emit('update:modelValue', $event)"
  />

  <UiRadioGroup
    v-else-if="field.type === 'radio'"
    :model-value="modelValue as string | undefined"
    :options="field.options ?? []"
    :label="field.label"
    :hint="field.hint"
    :error="field.error"
    :disabled="field.disabled"
    @update:model-value="emit('update:modelValue', $event)"
  />

  <UiComboBox
    v-else-if="field.type === 'combobox' || field.type === 'autocomplete'"
    :model-value="modelValue as string | undefined"
    :options="field.options ?? []"
    :label="field.label"
    :placeholder="field.placeholder"
    :hint="field.hint"
    :error="field.error"
    :disabled="field.disabled"
    :name="field.name"
    @update:model-value="emit('update:modelValue', $event)"
  />

  <UiFileUpload
    v-else-if="field.type === 'file'"
    :label="field.label"
    :hint="field.hint"
    :error="field.error"
    :disabled="field.disabled"
    :name="field.name"
  />

  <UiOTPField
    v-else-if="field.type === 'otp'"
    :model-value="modelValue as string | undefined"
    :label="field.label"
    :hint="field.hint"
    :error="field.error"
    :disabled="field.disabled"
    :name="field.name"
    @update:model-value="emit('update:modelValue', $event)"
  />

  <UiTagsField
    v-else-if="field.type === 'tags'"
    :model-value="modelValue as string[] | undefined"
    :label="field.label"
    :hint="field.hint"
    :error="field.error"
    :disabled="field.disabled"
    :name="field.name"
    @update:model-value="emit('update:modelValue', $event)"
  />

  <UiDateField
    v-else-if="field.type === 'date'"
    :model-value="modelValue as Date | undefined"
    :label="field.label"
    :hint="field.hint"
    :error="field.error"
    :disabled="field.disabled"
    :name="field.name"
    @update:model-value="emit('update:modelValue', $event)"
  />

  <UiTimeField
    v-else-if="field.type === 'time'"
    :model-value="modelValue as string | undefined"
    :label="field.label"
    :hint="field.hint"
    :error="field.error"
    :disabled="field.disabled"
    :name="field.name"
    @update:model-value="emit('update:modelValue', $event)"
  />

  <UiDatePicker
    v-else-if="field.type === 'datetime'"
    :model-value="modelValue as Date | undefined"
    :label="field.label"
    :hint="field.hint"
    :error="field.error"
    :disabled="field.disabled"
    :name="field.name"
    @update:model-value="emit('update:modelValue', $event)"
  />

  <UiSlider
    v-else-if="field.type === 'slider'"
    :model-value="modelValue as number | undefined"
    :label="field.label"
    :hint="field.hint"
    :error="field.error"
    :disabled="field.disabled"
    :name="field.name"
    @update:model-value="emit('update:modelValue', $event)"
  />

  <UiColorPicker
    v-else-if="field.type === 'color'"
    :model-value="modelValue as string | undefined"
    :label="field.label"
    :hint="field.hint"
    :error="field.error"
    :disabled="field.disabled"
    :name="field.name"
    @update:model-value="emit('update:modelValue', $event)"
  />

  <UiEditable
    v-else-if="field.type === 'editable'"
    :model-value="modelValue as string | undefined"
    :label="field.label"
    :placeholder="field.placeholder"
    :hint="field.hint"
    :error="field.error"
    :disabled="field.disabled"
    :name="field.name"
    @update:model-value="emit('update:modelValue', $event)"
  />

  <UiRatingField
    v-else-if="field.type === 'rating'"
    :model-value="modelValue as number | undefined"
    :label="field.label"
    :hint="field.hint"
    :error="field.error"
    :disabled="field.disabled"
    :name="field.name"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>
