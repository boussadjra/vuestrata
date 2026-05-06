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
  next,
  previous,
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
    <!-- Step indicator -->
    <div class="mb-4 flex items-center gap-2">
      <template v-for="(step, idx) in steps" :key="step.id">
        <div
          class="flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium"
          :class="{
            'bg-primary-500 text-white': idx === currentIndex,
            'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300':
              idx < currentIndex,
            'bg-surface-200 text-surface-500 dark:bg-surface-700': idx > currentIndex,
          }"
        >
          {{ idx + 1 }}
        </div>
        <div v-if="idx < steps.length - 1" class="bg-surface-200 dark:bg-surface-700 h-0.5 flex-1">
          <div
            class="bg-primary-500 h-full transition-all"
            :style="{ width: idx < currentIndex ? '100%' : '0%' }"
          />
        </div>
      </template>
    </div>

    <!-- Step content -->
    <slot :FormStep="FormStep" :current-step="currentStep" :current-index="currentIndex" />

    <!-- Navigation -->
    <div
      class="border-surface-200 dark:border-surface-700 flex items-center justify-between border-t pt-4"
    >
      <button
        v-bind="previousButtonProps"
        class="border-surface-300 dark:border-surface-600 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-md border px-4 py-2 text-sm"
      >
        {{ previousLabel }}
      </button>
      <button
        v-bind="nextButtonProps"
        class="bg-primary-500 hover:bg-primary-600 rounded-md px-4 py-2 text-sm text-white"
      >
        {{ isLastStep ? 'Submit' : nextLabel }}
      </button>
    </div>
  </form>
</template>
