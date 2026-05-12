<script setup lang="ts">
import type { Component } from 'vue'

import type { StepperItem } from '~/types'

export interface BaseStepperProps {
  provider: 'reka' | 'vuetify0'
  steps: StepperItem[]
  modelValue?: number
  rootComponent?: Component
  itemComponent?: Component
}

const props = withDefaults(defineProps<BaseStepperProps>(), {
  modelValue: 0,
  rootComponent: undefined,
  itemComponent: undefined,
})

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
const current = computed(() => Math.max(0, Math.min(props.modelValue, props.steps.length - 1)))

const hasProviderStepper = computed(() => Boolean(props.rootComponent && props.itemComponent))

function goTo(step: number) {
  emit('update:modelValue', step)
}

function onUpdateModelValue(value: unknown) {
  if (typeof value === 'number') {
    emit('update:modelValue', value)
  }
}
</script>

<template>
  <component
    v-if="hasProviderStepper"
    :is="rootComponent"
    :model-value="current"
    @update:model-value="onUpdateModelValue"
  >
    <ol class="grid gap-3" :data-provider="provider" data-ui="stepper">
      <component
        :is="itemComponent"
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
      </component>
    </ol>
  </component>

  <ol v-else class="grid gap-3" :data-provider="provider" data-ui="stepper">
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
