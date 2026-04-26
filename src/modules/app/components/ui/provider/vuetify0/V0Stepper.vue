<script setup lang="ts">
import { Step } from '@vuetify/v0'

import type { StepperItem } from '~/types'

export interface StepperProps {
  steps: StepperItem[]
  modelValue?: number
}

const props = withDefaults(defineProps<StepperProps>(), {
  modelValue: 0,
})

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
const current = computed(() => Math.max(0, Math.min(props.modelValue, props.steps.length - 1)))
</script>

<template>
  <Step.Root
    :model-value="current"
    @update:model-value="(v: number) => emit('update:modelValue', v)"
  >
    <ol class="grid gap-3" data-provider="vuetify0" data-ui="stepper">
      <Step.Item
        v-for="(step, index) in steps"
        :key="step.label"
        :value="index"
        class="flex items-start gap-3"
      >
        <button
          type="button"
          class="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold"
          :class="
            index <= current
              ? 'border-primary-500 bg-primary-500 text-white'
              : 'border-surface-300 text-surface-500 dark:border-surface-700 dark:text-surface-400'
          "
          :aria-current="index === current ? 'step' : undefined"
          @click="emit('update:modelValue', index)"
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
      </Step.Item>
    </ol>
  </Step.Root>
</template>
