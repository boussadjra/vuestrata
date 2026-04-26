<script setup lang="ts">
import { useBaseSteppedForm, type SteppedFormProps } from '@/components/ui/base'

const props = withDefaults(defineProps<SteppedFormProps>(), {
  nextLabel: 'Next',
  previousLabel: 'Previous',
})

const {
  steps,
  currentStep,
  currentIndex,
  isLastStep,
  formProps,
  nextButtonProps,
  previousButtonProps,
  onDone,
  FormStep,
} = useBaseSteppedForm(props)

const emit = defineEmits<{ done: [values: unknown] }>()

onDone((data) => {
  emit('done', data)
})
</script>

<template>
  <form
    v-bind="formProps"
    class="flex flex-col gap-4"
    data-provider="vuetify0"
    data-ui="stepped-form"
  >
    <div class="mb-2 flex gap-2">
      <span
        v-for="(step, idx) in steps"
        :key="step.id"
        class="text-sm"
        :class="{
          'text-primary-500 font-bold': idx === currentIndex,
          'text-surface-400': idx !== currentIndex,
        }"
      >
        Step {{ idx + 1 }}
      </span>
    </div>
    <slot :FormStep="FormStep" :current-step="currentStep" :current-index="currentIndex" />
    <div class="flex justify-between pt-2">
      <button v-bind="previousButtonProps" class="rounded border px-4 py-2 text-sm">
        {{ previousLabel }}
      </button>
      <button v-bind="nextButtonProps" class="bg-primary-500 rounded px-4 py-2 text-sm text-white">
        {{ isLastStep ? 'Submit' : nextLabel }}
      </button>
    </div>
  </form>
</template>
