<script setup lang="ts">
import { useUiForm } from '@/composables/forms'
import type { AppError } from '~/lib/errors'
import type { FormProps } from '~/types/forms'

import UiUnsavedChangesDialog from './UiUnsavedChangesDialog.vue'

const props = withDefaults(defineProps<FormProps>(), {
  disabled: false,
  disableHtmlValidation: true,
  showErrors: 'always',
})

const emit = defineEmits<{
  submit: [values: Record<string, unknown>]
  success: [result: unknown, values: Record<string, unknown>]
  error: [error: AppError, values: Record<string, unknown>]
}>()

const {
  values,
  context,
  isSubmitting,
  wasSubmitted,
  isDirty,
  isTouched,
  isValid,
  formErrors,
  submitError,
  leaveGuard,
  onSubmit,
  setErrors,
  clearErrors,
  setValues,
  reset,
} = useUiForm(props, emit)

defineExpose({
  values,
  context,
  isSubmitting,
  wasSubmitted,
  isDirty,
  isTouched,
  isValid,
  formErrors,
  submitError,
  setErrors,
  clearErrors,
  setValues,
  reset,
})
</script>

<template>
  <form :novalidate="disableHtmlValidation" class="flex flex-col gap-4" @submit.prevent="onSubmit">
    <slot
      :values="values"
      :is-submitting="isSubmitting"
      :was-submitted="wasSubmitted"
      :is-dirty="isDirty()"
      :is-touched="isTouched()"
      :is-valid="isValid()"
      :form-errors="formErrors"
      :submit-error="submitError"
    />
    <!--
      Inside the form so the component keeps its single root, which is what
      lets a `class` on `UiForm` land on the form. The dialog itself is
      teleported to the body, so it is never the form's content.
    -->
    <UiUnsavedChangesDialog
      v-if="confirmLeave"
      :open="leaveGuard.isPrompting.value"
      @stay="leaveGuard.stay"
      @leave="leaveGuard.leave"
    />
  </form>
</template>
