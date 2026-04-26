<script setup lang="ts">
import ComponentApiTable from '@/components/docs/ComponentApiTable.vue'
import type { ApiPropRow, ApiEventRow } from '@/components/docs/ComponentApiTable.vue'
import ComponentDemo from '@/components/docs/ComponentDemo.vue'
import ComponentPlayground from '@/components/docs/ComponentPlayground.vue'
import type { PropDef } from '@/components/docs/ComponentPlayground.vue'
import ComponentTestRunner from '@/components/docs/ComponentTestRunner.vue'

const basic = ref('')
const withError = ref('')
const playgroundValue = ref('')

const fruitOptions = [
  { label: 'Apple', value: 'apple' },
  { label: 'Banana', value: 'banana' },
  { label: 'Cherry', value: 'cherry' },
  { label: 'Date', value: 'date' },
]

const roleOptions = [
  { label: 'Admin', value: 'admin' },
  { label: 'Editor', value: 'editor' },
  { label: 'Viewer', value: 'viewer' },
  { label: 'Guest (disabled)', value: 'guest', disabled: true },
]

const countryOptions = [
  { label: 'United States', value: 'us' },
  { label: 'United Kingdom', value: 'uk' },
  { label: 'France', value: 'fr' },
  { label: 'Germany', value: 'de' },
  { label: 'Japan', value: 'jp' },
]

const propDefs: PropDef[] = [
  { name: 'label', type: 'string', default: 'Choose' },
  { name: 'placeholder', type: 'string', default: 'Select…' },
  { name: 'hint', type: 'string', default: '' },
  { name: 'error', type: 'string', default: '' },
  { name: 'disabled', type: 'boolean', default: false },
]

const usageCode = `<UiSelect v-model="fruit" :options="fruitOptions" label="Favorite fruit" placeholder="Select a fruit…" />`

const labelHintCode = `<UiSelect v-model="country" :options="countryOptions" label="Country" hint="Select your country of residence" placeholder="Choose country…" />`

const validationCode = `<UiSelect v-model="role" :options="roleOptions" label="Role" error="Please select a role" placeholder="Select role…" />`

const disabledOptionsCode = `<UiSelect model-value="editor" :options="roleOptions" label="User role" />`

const disabledCode = `<UiSelect model-value="apple" :options="fruitOptions" label="Locked selection" disabled />`

const apiProps: ApiPropRow[] = [
  { name: 'modelValue', type: 'string', default: "''", description: 'Selected value (v-model)' },
  {
    name: 'options',
    type: '{ label, value, disabled? }[]',
    default: '[]',
    description: 'List of options',
  },
  { name: 'placeholder', type: 'string', default: "'Select...'", description: 'Placeholder text' },
  { name: 'label', type: 'string', description: 'Field label' },
  { name: 'hint', type: 'string', description: 'Helper text' },
  { name: 'error', type: 'string', description: 'Error message' },
  { name: 'disabled', type: 'boolean', default: 'false', description: 'Disables the select' },
]

const apiEvents: ApiEventRow[] = [
  { name: 'update:modelValue', payload: 'string', description: 'Emitted when selection changes' },
]
</script>

<template>
  <div class="space-y-12">
    <header>
      <h1 class="mb-2 text-3xl font-bold">Select</h1>
      <p class="text-surface-500 dark:text-surface-400 text-lg">
        Dropdown select for choosing one option from a list.
      </p>
    </header>

    <!-- Usage -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Usage</h2>
      <ComponentDemo :code="usageCode">
        <div class="max-w-xs">
          <UiSelect
            v-model="basic"
            :options="fruitOptions"
            label="Favorite fruit"
            placeholder="Select a fruit…"
          />
        </div>
      </ComponentDemo>
    </section>

    <!-- With Label & Hint -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">With Label &amp; Hint</h2>
      <ComponentDemo :code="labelHintCode">
        <div class="max-w-xs">
          <UiSelect
            v-model="basic"
            :options="countryOptions"
            label="Country"
            hint="Select your country of residence"
            placeholder="Choose country…"
          />
        </div>
      </ComponentDemo>
    </section>

    <!-- With Error -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Validation</h2>
      <ComponentDemo :code="validationCode">
        <div class="max-w-xs">
          <UiSelect
            v-model="withError"
            :options="roleOptions"
            label="Role"
            error="Please select a role"
            placeholder="Select role…"
          />
        </div>
      </ComponentDemo>
    </section>

    <!-- Disabled Options -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Disabled Options</h2>
      <p class="text-surface-500 text-sm">
        Individual options can be disabled via the
        <code class="bg-surface-100 dark:bg-surface-800 rounded px-1.5 py-0.5 text-xs"
          >disabled</code
        >
        property.
      </p>
      <ComponentDemo :code="disabledOptionsCode">
        <div class="max-w-xs">
          <UiSelect model-value="editor" :options="roleOptions" label="User role" />
        </div>
      </ComponentDemo>
    </section>

    <!-- Disabled State -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Disabled</h2>
      <ComponentDemo :code="disabledCode">
        <div class="max-w-xs">
          <UiSelect model-value="apple" :options="fruitOptions" label="Locked selection" disabled />
        </div>
      </ComponentDemo>
    </section>

    <!-- Playground -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Playground</h2>
      <ComponentPlayground :prop-defs="propDefs">
        <template #default="{ props: p }">
          <UiSelect v-bind="p" v-model="playgroundValue" :options="fruitOptions" />
        </template>
      </ComponentPlayground>
    </section>

    <!-- Accessibility Audit -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Accessibility</h2>
      <ComponentTestRunner>
        <div class="max-w-xs space-y-4">
          <UiSelect
            model-value=""
            :options="fruitOptions"
            label="Default"
            placeholder="Select a fruit…"
          />
          <UiSelect
            model-value=""
            :options="roleOptions"
            label="With error"
            error="Please select a role"
            placeholder="Select role…"
          />
          <UiSelect model-value="apple" :options="fruitOptions" label="Disabled" disabled />
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
