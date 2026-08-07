<script setup lang="ts">
import ComponentApiTable from '@/components/docs/ComponentApiTable.vue'
import type { ApiPropRow, ApiEventRow } from '@/components/docs/ComponentApiTable.vue'
import ComponentDemo from '@/components/docs/ComponentDemo.vue'
import ComponentPlayground from '@/components/docs/ComponentPlayground.vue'
import type { PropDef } from '@/components/docs/ComponentPlayground.vue'
import ComponentTestRunner from '@/components/docs/ComponentTestRunner.vue'

const basic = ref('')
const email = ref('')
const password = ref('')
const search = ref('')
const withError = ref('')
const withHint = ref('')
const disabled = ref('Cannot edit')
const playgroundValue = ref('')

const propDefs: PropDef[] = [
  {
    name: 'type',
    type: 'select',
    default: 'text',
    options: [
      { label: 'text', value: 'text' },
      { label: 'email', value: 'email' },
      { label: 'password', value: 'password' },
      { label: 'number', value: 'number' },
      { label: 'search', value: 'search' },
    ],
  },
  { name: 'label', type: 'string', default: 'Label' },
  { name: 'placeholder', type: 'string', default: 'Enter value…' },
  { name: 'hint', type: 'string', default: '' },
  { name: 'error', type: 'string', default: '' },
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
  { name: 'disabled', type: 'boolean', default: false },
  { name: 'required', type: 'boolean', default: false },
]

const usageCode = `<UiTextField v-model="name" label="Name" placeholder="Enter your name" />`

const typesCode = `<UiTextField v-model="email" type="email" label="Email" placeholder="you@example.com" />
<UiTextField v-model="password" type="password" label="Password" placeholder="••••••••" />
<UiTextField v-model="search" type="search" label="Search" placeholder="Search anything…" />`

const validationCode = `<UiTextField v-model="value" label="Username" error="This field is required" placeholder="Enter username" />
<UiTextField v-model="value" label="Email" hint="We'll never share your email" placeholder="you@example.com" />`

const sizesCode = `<UiTextField label="Small" size="sm" placeholder="Small input" />
<UiTextField label="Medium (default)" size="md" placeholder="Medium input" />
<UiTextField label="Large" size="lg" placeholder="Large input" />`

const disabledCode = `<UiTextField v-model="locked" label="Read only" disabled />`

const requiredCode = `<UiTextField label="Full name" required placeholder="Required field" />`

const apiProps: ApiPropRow[] = [
  { name: 'modelValue', type: 'string', default: "''", description: 'Bound value (v-model)' },
  {
    name: 'type',
    type: "'text' | 'email' | 'password' | 'number' | 'search' | 'tel' | 'url'",
    default: "'text'",
    description: 'HTML input type',
  },
  { name: 'label', type: 'string', description: 'Field label' },
  { name: 'placeholder', type: 'string', description: 'Placeholder text' },
  { name: 'hint', type: 'string', description: 'Helper text below the input' },
  { name: 'error', type: 'string', description: 'Error message (replaces hint)' },
  { name: 'disabled', type: 'boolean', default: 'false', description: 'Disables the input' },
  {
    name: 'required',
    type: 'boolean',
    default: 'false',
    description: 'Marks the field as required',
  },
  { name: 'size', type: "'sm' | 'md' | 'lg'", default: "'md'", description: 'Input size' },
  { name: 'id', type: 'string', description: 'HTML id attribute' },
  { name: 'name', type: 'string', description: 'HTML name attribute' },
]

const apiEvents: ApiEventRow[] = [
  { name: 'update:modelValue', payload: 'string', description: 'Emitted when the value changes' },
]
</script>

<template>
  <div class="space-y-12">
    <header>
      <h1 class="mb-2 text-3xl font-bold">TextField</h1>
      <p class="text-muted-foreground text-lg">
        Single-line text input with label, hint, error, and size options.
      </p>
    </header>

    <!-- Usage -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Usage</h2>
      <ComponentDemo :code="usageCode">
        <div class="max-w-sm">
          <UiTextField v-model="basic" label="Name" placeholder="Enter your name" />
        </div>
      </ComponentDemo>
    </section>

    <!-- Types -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Input Types</h2>
      <p class="text-surface-500 text-sm">
        Use the
        <code class="bg-surface-100 dark:bg-surface-800 rounded px-1.5 py-0.5 text-xs">type</code>
        prop for different input types.
      </p>
      <ComponentDemo :code="typesCode">
        <div class="max-w-sm space-y-4">
          <UiTextField v-model="email" type="email" label="Email" placeholder="you@example.com" />
          <UiTextField v-model="password" type="password" label="Password" placeholder="••••••••" />
          <UiTextField v-model="search" type="text" label="Search" placeholder="Search anything…" />
        </div>
      </ComponentDemo>
    </section>

    <!-- Validation -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Validation States</h2>
      <ComponentDemo :code="validationCode">
        <div class="max-w-sm space-y-4">
          <UiTextField
            v-model="withError"
            label="Username"
            error="This field is required"
            placeholder="Enter username"
          />
          <UiTextField
            v-model="withHint"
            label="Email"
            hint="We'll never share your email"
            placeholder="you@example.com"
          />
        </div>
      </ComponentDemo>
    </section>

    <!-- Sizes -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Sizes</h2>
      <ComponentDemo :code="sizesCode">
        <div class="max-w-sm space-y-4">
          <UiTextField label="Small" size="sm" placeholder="Small input" />
          <UiTextField label="Medium (default)" size="md" placeholder="Medium input" />
          <UiTextField label="Large" size="lg" placeholder="Large input" />
        </div>
      </ComponentDemo>
    </section>

    <!-- Disabled -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Disabled</h2>
      <ComponentDemo :code="disabledCode">
        <div class="max-w-sm">
          <UiTextField v-model="disabled" label="Read only" disabled />
        </div>
      </ComponentDemo>
    </section>

    <!-- Required -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Required</h2>
      <ComponentDemo :code="requiredCode">
        <div class="max-w-sm">
          <UiTextField label="Full name" required placeholder="Required field" />
        </div>
      </ComponentDemo>
    </section>

    <!-- Playground -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Playground</h2>
      <ComponentPlayground :prop-defs="propDefs">
        <template #default="{ props: p }">
          <UiTextField v-bind="p" v-model="playgroundValue" />
        </template>
      </ComponentPlayground>
    </section>

    <!-- Accessibility Audit -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Accessibility</h2>
      <ComponentTestRunner>
        <div class="max-w-sm space-y-4">
          <UiTextField label="Name" placeholder="Enter your name" />
          <UiTextField
            label="Email"
            type="email"
            error="Required field"
            placeholder="you@example.com"
          />
          <UiTextField label="Disabled" disabled model-value="Cannot edit" />
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
