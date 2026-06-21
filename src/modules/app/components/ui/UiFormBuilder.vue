<script setup lang="ts">
import type { FormBuilderField } from '~/composables/useFormBuilder'
import { resolveIcon } from '~/config/icon-provider'

import UiFormField from './UiFormField.vue'

export interface FormBuilderProps {
  fields: FormBuilderField[]
  submitting?: boolean
  submitLabel?: string
  cols?: 1 | 2 | 3
}

withDefaults(defineProps<FormBuilderProps>(), {
  submitting: false,
  submitLabel: 'Submit',
  cols: 1,
})

const emit = defineEmits<{
  submit: [event: Event]
}>()

const colsClass: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 md:grid-cols-2',
  3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
}

function spanClass(span?: number) {
  if (!span || span === 1) return ''
  if (span === 2) return 'md:col-span-2'
  if (span === 3) return 'lg:col-span-3'
  return ''
}
</script>

<template>
  <form class="space-y-6" @submit="emit('submit', $event)">
    <div :class="['grid gap-4', colsClass[cols]]">
      <div v-for="field in fields" :key="field.name" :class="spanClass(field.colSpan)">
        <UiFormField :field="field" />
      </div>
    </div>

    <slot name="actions" :submitting="submitting">
      <button
        type="submit"
        :disabled="submitting"
        class="bg-primary-700 hover:bg-primary-800 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium text-white shadow-md transition-all disabled:opacity-60"
      >
        <span v-if="submitting" :class="[resolveIcon('spinner'), 'h-4 w-4 animate-spin']" />
        {{ submitLabel }}
      </button>
    </slot>
  </form>
</template>
