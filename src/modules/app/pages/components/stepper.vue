<script setup lang="ts">
import ComponentApiTable from '@/components/docs/ComponentApiTable.vue'
import type { ApiPropRow, ApiEventRow } from '@/components/docs/ComponentApiTable.vue'
import ComponentDemo from '@/components/docs/ComponentDemo.vue'
import ComponentTestRunner from '@/components/docs/ComponentTestRunner.vue'

const activeStep = ref(1)

const basicSteps = [
  { label: 'Project setup', description: 'Install deps and initialize config.' },
  { label: 'Build UI layer', description: 'Implement reusable adapter components.' },
  { label: 'Integrate data', description: 'Connect stores and API client.' },
  { label: 'Ship', description: 'Run QA and deploy.' },
]

const checkoutSteps = [
  { label: 'Cart' },
  { label: 'Shipping' },
  { label: 'Payment' },
  { label: 'Confirmation' },
]

const checkoutStep = ref(0)

const usageCode = `<UiStepper v-model="activeStep" :steps="basicSteps" />`

const controlsCode = `<UiStepper v-model="activeStep" :steps="basicSteps" />
<UiButton size="sm" variant="ghost" :disabled="activeStep <= 0" @click="activeStep--">Previous</UiButton>
<UiButton size="sm" :disabled="activeStep >= basicSteps.length - 1" @click="activeStep++">Next</UiButton>`

const minimalCode = `<UiStepper v-model="checkoutStep" :steps="checkoutSteps" />
<UiButton size="sm" variant="ghost" :disabled="checkoutStep <= 0" @click="checkoutStep--">Back</UiButton>
<UiButton size="sm" :disabled="checkoutStep >= checkoutSteps.length - 1" @click="checkoutStep++">Continue</UiButton>`

const statesCode = `<UiStepper :model-value="0" :steps="basicSteps" />
<UiStepper :model-value="1" :steps="basicSteps" />
<UiStepper :model-value="3" :steps="basicSteps" />`

const apiProps: ApiPropRow[] = [
  {
    name: 'steps',
    type: '{ label, description? }[]',
    default: '[]',
    description: 'Step definitions',
  },
  { name: 'modelValue', type: 'number', default: '0', description: 'Active step index (v-model)' },
]

const apiEvents: ApiEventRow[] = [
  { name: 'update:modelValue', payload: 'number', description: 'Emitted when active step changes' },
]
</script>

<template>
  <div class="space-y-12">
    <header>
      <h1 class="mb-2 text-3xl font-bold">Stepper</h1>
      <p class="text-surface-500 dark:text-surface-400 text-lg">
        Multi-step process indicator with navigation controls and step descriptions.
      </p>
    </header>

    <!-- Usage -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Usage</h2>
      <ComponentDemo :code="usageCode">
        <div class="max-w-lg">
          <UiStepper v-model="activeStep" :steps="basicSteps" />
        </div>
      </ComponentDemo>
    </section>

    <!-- With Controls -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">With Navigation Controls</h2>
      <ComponentDemo :code="controlsCode">
        <div class="max-w-lg space-y-4">
          <UiStepper v-model="activeStep" :steps="basicSteps" />
          <div class="flex gap-2">
            <UiButton
              size="sm"
              variant="ghost"
              :disabled="activeStep <= 0"
              @click="activeStep = Math.max(0, activeStep - 1)"
              >Previous</UiButton
            >
            <UiButton
              size="sm"
              :disabled="activeStep >= basicSteps.length - 1"
              @click="activeStep = Math.min(basicSteps.length - 1, activeStep + 1)"
              >Next</UiButton
            >
          </div>
          <p class="text-surface-500 text-xs">
            Step {{ activeStep + 1 }} of {{ basicSteps.length }}:
            <span class="font-medium">{{ basicSteps[activeStep]?.label }}</span>
          </p>
        </div>
      </ComponentDemo>
    </section>

    <!-- Minimal (No Descriptions) -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Minimal (No Descriptions)</h2>
      <ComponentDemo :code="minimalCode">
        <div class="max-w-lg space-y-4">
          <UiStepper v-model="checkoutStep" :steps="checkoutSteps" />
          <div class="flex gap-2">
            <UiButton
              size="sm"
              variant="ghost"
              :disabled="checkoutStep <= 0"
              @click="checkoutStep--"
              >Back</UiButton
            >
            <UiButton
              size="sm"
              :disabled="checkoutStep >= checkoutSteps.length - 1"
              @click="checkoutStep++"
              >Continue</UiButton
            >
          </div>
        </div>
      </ComponentDemo>
    </section>

    <!-- All States -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Step States</h2>
      <p class="text-surface-500 text-sm">
        Steps before the active step show as completed, the active step is highlighted, and future
        steps are pending.
      </p>
      <ComponentDemo :code="statesCode">
        <div class="max-w-lg space-y-6">
          <div>
            <p class="text-surface-400 mb-2 text-xs font-medium">At step 1 (start):</p>
            <UiStepper :model-value="0" :steps="basicSteps" />
          </div>
          <div>
            <p class="text-surface-400 mb-2 text-xs font-medium">At step 2 (in progress):</p>
            <UiStepper :model-value="1" :steps="basicSteps" />
          </div>
          <div>
            <p class="text-surface-400 mb-2 text-xs font-medium">At step 4 (completed):</p>
            <UiStepper :model-value="3" :steps="basicSteps" />
          </div>
        </div>
      </ComponentDemo>
    </section>

    <!-- Accessibility -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Accessibility</h2>
      <ComponentTestRunner>
        <div class="max-w-lg">
          <UiStepper :model-value="1" :steps="basicSteps" />
        </div>
      </ComponentTestRunner>
    </section>

    <!-- API Reference -->
    <ComponentApiTable :props="apiProps" :events="apiEvents" />
  </div>
</template>

<route lang="yaml">
meta:
  layout: components
</route>
