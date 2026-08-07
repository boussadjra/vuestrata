<script setup lang="ts">
import ComponentApiTable from '@/components/docs/ComponentApiTable.vue'
import type { ApiPropRow, ApiEventRow } from '@/components/docs/ComponentApiTable.vue'
import ComponentDemo from '@/components/docs/ComponentDemo.vue'
import ComponentPlayground from '@/components/docs/ComponentPlayground.vue'
import type { PropDef } from '@/components/docs/ComponentPlayground.vue'
import ComponentTestRunner from '@/components/docs/ComponentTestRunner.vue'

const basic = ref(false)
const checked = ref(true)
const indeterminate = ref<boolean | 'indeterminate'>('indeterminate')
const terms = ref(false)
const newsletter = ref(true)
const updates = ref(false)
const playgroundValue = ref(false)

const propDefs: PropDef[] = [
  { name: 'label', type: 'string', default: 'Check me' },
  { name: 'disabled', type: 'boolean', default: false },
  {
    name: 'size',
    type: 'select',
    default: 'md',
    options: [
      { label: 'sm', value: 'sm' },
      { label: 'md', value: 'md' },
      { label: 'lg', value: 'lg' },
    ],
  },
]

const usageCode = `<UiCheckbox v-model="accepted" label="Accept terms and conditions" />`

const statesCode = `<UiCheckbox v-model="checked" label="Checked" />
<UiCheckbox :model-value="false" label="Unchecked" />
<UiCheckbox v-model="indeterminate" label="Indeterminate" />
<UiCheckbox :model-value="false" label="Disabled (unchecked)" disabled />
<UiCheckbox :model-value="true" label="Disabled (checked)" disabled />`

const sizesCode = `<UiCheckbox :model-value="true" label="Small checkbox" size="sm" />
<UiCheckbox :model-value="true" label="Medium checkbox (default)" size="md" />
<UiCheckbox :model-value="true" label="Large checkbox" size="lg" />`

const groupCode = `<fieldset class="space-y-3">
  <legend>Notification preferences</legend>
  <UiCheckbox v-model="updates" label="Product updates" />
  <UiCheckbox v-model="newsletter" label="Weekly newsletter" />
  <UiCheckbox v-model="community" label="Community announcements" />
</fieldset>`

const apiProps: ApiPropRow[] = [
  {
    name: 'modelValue',
    type: "boolean | 'indeterminate'",
    default: 'false',
    description: 'Checked state (v-model)',
  },
  { name: 'label', type: 'string', description: 'Checkbox label' },
  { name: 'disabled', type: 'boolean', default: 'false', description: 'Disables the checkbox' },
  { name: 'size', type: "'sm' | 'md' | 'lg'", default: "'md'", description: 'Checkbox size' },
  { name: 'id', type: 'string', description: 'HTML id attribute' },
  { name: 'name', type: 'string', description: 'HTML name attribute' },
]

const apiEvents: ApiEventRow[] = [
  {
    name: 'update:modelValue',
    payload: "boolean | 'indeterminate'",
    description: 'Emitted when checked state changes',
  },
]
</script>

<template>
  <div class="space-y-12">
    <header>
      <h1 class="mb-2 text-3xl font-bold">Checkbox</h1>
      <p class="text-muted-foreground text-lg">
        Binary toggle with label, indeterminate support, and multiple sizes.
      </p>
    </header>

    <!-- Usage -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Usage</h2>
      <ComponentDemo :code="usageCode">
        <UiCheckbox v-model="basic" label="Accept terms and conditions" id="basic-check" />
      </ComponentDemo>
    </section>

    <!-- States -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">States</h2>
      <ComponentDemo :code="statesCode">
        <div class="space-y-4">
          <UiCheckbox v-model="checked" label="Checked" id="state-checked" />
          <UiCheckbox :model-value="false" label="Unchecked" id="state-unchecked" />
          <UiCheckbox v-model="indeterminate" label="Indeterminate" id="state-indeterminate" />
          <UiCheckbox
            :model-value="false"
            label="Disabled (unchecked)"
            id="state-disabled-off"
            disabled
          />
          <UiCheckbox
            :model-value="true"
            label="Disabled (checked)"
            id="state-disabled-on"
            disabled
          />
        </div>
      </ComponentDemo>
    </section>

    <!-- Sizes -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Sizes</h2>
      <ComponentDemo :code="sizesCode">
        <div class="space-y-4">
          <UiCheckbox :model-value="true" label="Small checkbox" id="size-sm" size="sm" />
          <UiCheckbox
            :model-value="true"
            label="Medium checkbox (default)"
            id="size-md"
            size="md"
          />
          <UiCheckbox :model-value="true" label="Large checkbox" id="size-lg" size="lg" />
        </div>
      </ComponentDemo>
    </section>

    <!-- Group Example -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Checkbox Group</h2>
      <p class="text-surface-500 text-sm">
        Combine multiple checkboxes for multi-select scenarios.
      </p>
      <ComponentDemo :code="groupCode">
        <fieldset class="space-y-3">
          <legend class="text-foreground mb-2 text-sm font-medium">Notification preferences</legend>
          <UiCheckbox v-model="terms" label="Product updates" id="pref-updates" />
          <UiCheckbox v-model="newsletter" label="Weekly newsletter" id="pref-newsletter" />
          <UiCheckbox v-model="updates" label="Community announcements" id="pref-community" />
        </fieldset>
      </ComponentDemo>
    </section>

    <!-- Playground -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Playground</h2>
      <ComponentPlayground :prop-defs="propDefs">
        <template #default="{ props: p }">
          <UiCheckbox v-bind="p" v-model="playgroundValue" />
        </template>
      </ComponentPlayground>
    </section>

    <!-- Accessibility Audit -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Accessibility</h2>
      <ComponentTestRunner>
        <div class="space-y-4">
          <UiCheckbox :model-value="true" label="Checked" id="a11y-checked" />
          <UiCheckbox :model-value="false" label="Unchecked" id="a11y-unchecked" />
          <UiCheckbox :model-value="false" label="Disabled" id="a11y-disabled" disabled />
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
