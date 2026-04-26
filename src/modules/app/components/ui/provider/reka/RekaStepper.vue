<script setup lang="ts">
import type { StepperItem } from '~/types'

export type { StepperItem }

export interface StepperProps {
  steps: StepperItem[]
  modelValue?: number
}

const props = withDefaults(defineProps<StepperProps>(), {
  modelValue: 0,
})

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
const current = computed(() => Math.max(0, Math.min(props.modelValue, props.steps.length - 1)))

function goTo(step: number) {
  emit('update:modelValue', step)
}
</script>

<template>
  <ol class="grid gap-3" data-provider="reka" data-ui="stepper">
    <li v-for="(step, index) in steps" :key="step.label" class="flex items-start gap-3">
      <button
        type="button"
        class="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold"
        :class="
          index <= current
            ? 'border-primary-500 bg-primary-500 text-white'
            : 'border-surface-300 text-surface-500 dark:border-surface-700 dark:text-surface-400'
        "
        :aria-current="index === current ? 'step' : undefined"
        @click="goTo(index)"
      >
        {{ index + 1 }}
      </button>
      <div class="min-w-0">
        <p
          class="text-sm font-semibold"
          :class="
            index <= current
              ? 'text-surface-900 dark:text-surface-100'
              : 'text-surface-500 dark:text-surface-400'
          "
        >
          {{ step.label }}
        </p>
        <p v-if="step.description" class="text-surface-500 dark:text-surface-400 text-xs">
          {{ step.description }}
        </p>
      </div>
    </li>
  </ol>
</template>
