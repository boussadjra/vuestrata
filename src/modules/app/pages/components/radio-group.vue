<script setup lang="ts">
import ComponentApiTable from '@/components/docs/ComponentApiTable.vue'
import type { ApiPropRow, ApiEventRow } from '@/components/docs/ComponentApiTable.vue'
import ComponentDemo from '@/components/docs/ComponentDemo.vue'
import ComponentPlayground from '@/components/docs/ComponentPlayground.vue'
import type { PropDef } from '@/components/docs/ComponentPlayground.vue'
import ComponentTestRunner from '@/components/docs/ComponentTestRunner.vue'

const basic = ref('starter')
const horizontal = ref('opt1')
const playgroundValue = ref('')

const planOptions = [
  { label: 'Starter', value: 'starter', description: 'Best for quick prototypes.' },
  { label: 'Professional', value: 'pro', description: 'Balanced defaults for teams.' },
  { label: 'Enterprise', value: 'enterprise', description: 'For complex product suites.' },
]

const simpleOptions = [
  { label: 'Option A', value: 'opt1' },
  { label: 'Option B', value: 'opt2' },
  { label: 'Option C', value: 'opt3' },
]

const withDisabled = [
  { label: 'Free', value: 'free' },
  { label: 'Pro', value: 'pro' },
  { label: 'Enterprise (coming soon)', value: 'enterprise', disabled: true },
]

const propDefs: PropDef[] = [
  { name: 'label', type: 'string', default: 'Pick option' },
  {
    name: 'orientation',
    type: 'select',
    default: 'vertical',
    options: [
      { label: 'vertical', value: 'vertical' },
      { label: 'horizontal', value: 'horizontal' },
    ],
  },
  { name: 'disabled', type: 'boolean', default: false },
  { name: 'hint', type: 'string', default: '' },
  { name: 'error', type: 'string', default: '' },
]

const usageCode = `<UiRadioGroup v-model="plan" label="Choose a plan" :options="planOptions" />`

const descriptionsCode = `<UiRadioGroup v-model="plan" label="Select a tier" hint="You can change this later" :options="planOptions" />`

const horizontalCode = `<UiRadioGroup v-model="selected" label="Pick one" orientation="horizontal" :options="simpleOptions" />`

const disabledCode = `<UiRadioGroup model-value="free" label="Pricing plan" :options="withDisabled" />`

const errorCode = `<UiRadioGroup model-value="" label="Required selection" error="Please select an option" :options="simpleOptions" />`

const apiProps: ApiPropRow[] = [
  { name: 'modelValue', type: 'string', default: "''", description: 'Selected value (v-model)' },
  {
    name: 'options',
    type: '{ label, value, disabled?, description? }[]',
    default: '[]',
    description: 'Array of options',
  },
  { name: 'label', type: 'string', description: 'Group label' },
  { name: 'hint', type: 'string', description: 'Helper text' },
  { name: 'error', type: 'string', description: 'Error message' },
  {
    name: 'orientation',
    type: "'vertical' | 'horizontal'",
    default: "'vertical'",
    description: 'Layout direction',
  },
  { name: 'disabled', type: 'boolean', default: 'false', description: 'Disables all options' },
]

const apiEvents: ApiEventRow[] = [
  { name: 'update:modelValue', payload: 'string', description: 'Emitted when selection changes' },
]
</script>

<template>
  <div class="space-y-12">
    <header>
      <h1 class="mb-2 text-3xl font-bold">RadioGroup</h1>
      <p class="text-surface-500 dark:text-surface-400 text-lg">
        Single-select from a set of options with optional descriptions.
      </p>
    </header>

    <!-- Usage -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Usage</h2>
      <ComponentDemo :code="usageCode">
        <div class="max-w-lg">
          <UiRadioGroup v-model="basic" label="Choose a plan" :options="planOptions" />
        </div>
      </ComponentDemo>
    </section>

    <!-- With Descriptions -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">With Descriptions</h2>
      <p class="text-surface-500 text-sm">
        Each option can include a
        <code class="bg-surface-100 dark:bg-surface-800 rounded px-1.5 py-0.5 text-xs"
          >description</code
        >
        field.
      </p>
      <ComponentDemo :code="descriptionsCode">
        <div class="max-w-lg">
          <UiRadioGroup
            v-model="basic"
            label="Select a tier"
            hint="You can change this later"
            :options="planOptions"
          />
          <p class="text-surface-500 mt-3 text-xs">
            Selected: <span class="font-medium">{{ basic }}</span>
          </p>
        </div>
      </ComponentDemo>
    </section>

    <!-- Horizontal -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Horizontal Orientation</h2>
      <ComponentDemo :code="horizontalCode">
        <div class="max-w-lg">
          <UiRadioGroup
            v-model="horizontal"
            label="Pick one"
            orientation="horizontal"
            :options="simpleOptions"
          />
        </div>
      </ComponentDemo>
    </section>

    <!-- Disabled Options -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Disabled Options</h2>
      <ComponentDemo :code="disabledCode">
        <div class="max-w-lg">
          <UiRadioGroup model-value="free" label="Pricing plan" :options="withDisabled" />
        </div>
      </ComponentDemo>
    </section>

    <!-- With Error -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">With Error</h2>
      <ComponentDemo :code="errorCode">
        <div class="max-w-lg">
          <UiRadioGroup
            model-value=""
            label="Required selection"
            error="Please select an option"
            :options="simpleOptions"
          />
        </div>
      </ComponentDemo>
    </section>

    <!-- Playground -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Playground</h2>
      <ComponentPlayground :prop-defs="propDefs">
        <template #default="{ props: p }">
          <UiRadioGroup v-bind="p" v-model="playgroundValue" :options="simpleOptions" />
        </template>
      </ComponentPlayground>
    </section>

    <!-- Accessibility Audit -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Accessibility</h2>
      <ComponentTestRunner>
        <div class="max-w-lg space-y-6">
          <UiRadioGroup model-value="opt1" label="Default group" :options="simpleOptions" />
          <UiRadioGroup
            model-value=""
            label="With error"
            error="Please select an option"
            :options="simpleOptions"
          />
          <UiRadioGroup model-value="free" label="With disabled" :options="withDisabled" />
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
