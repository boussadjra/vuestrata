<script setup lang="ts">
import ComponentApiTable from '@/components/docs/ComponentApiTable.vue'
import type { ApiPropRow, ApiEventRow } from '@/components/docs/ComponentApiTable.vue'
import ComponentDemo from '@/components/docs/ComponentDemo.vue'
import ComponentPlayground from '@/components/docs/ComponentPlayground.vue'
import type { PropDef } from '@/components/docs/ComponentPlayground.vue'
import ComponentTestRunner from '@/components/docs/ComponentTestRunner.vue'

const basic = ref('')
const withHint = ref('This starter is clean, fast, and theme-ready.')
const playgroundValue = ref('')

const propDefs: PropDef[] = [
  { name: 'label', type: 'string', default: 'Description' },
  { name: 'placeholder', type: 'string', default: 'Write something…' },
  { name: 'hint', type: 'string', default: '' },
  { name: 'error', type: 'string', default: '' },
  { name: 'rows', type: 'number', default: 4 },
  {
    name: 'resize',
    type: 'select',
    default: 'none',
    options: [
      { label: 'none', value: 'none' },
      { label: 'vertical', value: 'vertical' },
      { label: 'both', value: 'both' },
    ],
  },
  { name: 'disabled', type: 'boolean', default: false },
  { name: 'required', type: 'boolean', default: false },
]

const usageCode = `<UiTextarea v-model="text" label="Description" placeholder="Write something…" />`

const rowsCode = `<UiTextarea label="Short (3 rows)" :rows="3" placeholder="Short textarea" />
<UiTextarea v-model="brief" label="Project brief (6 rows)" hint="Write a short project summary" :rows="6" />`

const validationCode = `<UiTextarea label="Feedback" error="Please provide at least 20 characters" :rows="4" />
<UiTextarea label="Notes" hint="Optional field, max 500 characters" :rows="3" />`

const resizeCode = `<UiTextarea label="No resize" resize="none" :rows="3" placeholder="Cannot resize" />
<UiTextarea label="Vertical only" resize="vertical" :rows="3" placeholder="Vertical resize" />
<UiTextarea label="Both directions" resize="both" :rows="3" placeholder="Free resize" />`

const disabledCode = `<UiTextarea label="Disabled textarea" disabled model-value="This content cannot be edited." :rows="3" />`

const apiProps: ApiPropRow[] = [
  { name: 'modelValue', type: 'string', default: "''", description: 'Bound value (v-model)' },
  { name: 'label', type: 'string', description: 'Field label' },
  { name: 'placeholder', type: 'string', description: 'Placeholder text' },
  { name: 'hint', type: 'string', description: 'Helper text below the textarea' },
  { name: 'error', type: 'string', description: 'Error message' },
  { name: 'rows', type: 'number', default: '4', description: 'Visible rows' },
  {
    name: 'resize',
    type: "'none' | 'vertical' | 'both'",
    default: "'none'",
    description: 'Resize behavior',
  },
  { name: 'disabled', type: 'boolean', default: 'false', description: 'Disables the textarea' },
  { name: 'required', type: 'boolean', default: 'false', description: 'Required field' },
]

const apiEvents: ApiEventRow[] = [
  { name: 'update:modelValue', payload: 'string', description: 'Emitted when the value changes' },
]
</script>

<template>
  <div class="space-y-12">
    <header>
      <h1 class="mb-2 text-3xl font-bold">Textarea</h1>
      <p class="text-muted-foreground text-lg">
        Multi-line text input with label, hint, error, and resize control.
      </p>
    </header>

    <!-- Usage -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Usage</h2>
      <ComponentDemo :code="usageCode">
        <div class="max-w-lg">
          <UiTextarea v-model="basic" label="Description" placeholder="Write something…" />
        </div>
      </ComponentDemo>
    </section>

    <!-- Rows -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Custom Rows</h2>
      <ComponentDemo :code="rowsCode">
        <div class="max-w-lg space-y-4">
          <UiTextarea label="Short (3 rows)" :rows="3" placeholder="Short textarea" />
          <UiTextarea
            v-model="withHint"
            label="Project brief (6 rows)"
            hint="Write a short project summary"
            :rows="6"
          />
        </div>
      </ComponentDemo>
    </section>

    <!-- Validation -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Validation</h2>
      <ComponentDemo :code="validationCode">
        <div class="max-w-lg space-y-4">
          <UiTextarea label="Feedback" error="Please provide at least 20 characters" :rows="4" />
          <UiTextarea label="Notes" hint="Optional field, max 500 characters" :rows="3" />
        </div>
      </ComponentDemo>
    </section>

    <!-- Resize -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Resize Modes</h2>
      <p class="text-surface-500 text-sm">
        Control resize behavior with the
        <code class="bg-surface-100 dark:bg-surface-800 rounded px-1.5 py-0.5 text-xs">resize</code>
        prop.
      </p>
      <ComponentDemo :code="resizeCode">
        <div class="max-w-lg space-y-4">
          <UiTextarea label="No resize" resize="none" :rows="3" placeholder="Cannot resize" />
          <UiTextarea
            label="Vertical only"
            resize="vertical"
            :rows="3"
            placeholder="Vertical resize"
          />
          <UiTextarea label="Both directions" resize="both" :rows="3" placeholder="Free resize" />
        </div>
      </ComponentDemo>
    </section>

    <!-- Disabled -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Disabled</h2>
      <ComponentDemo :code="disabledCode">
        <div class="max-w-lg">
          <UiTextarea
            label="Disabled textarea"
            disabled
            model-value="This content cannot be edited."
            :rows="3"
          />
        </div>
      </ComponentDemo>
    </section>

    <!-- Playground -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Playground</h2>
      <ComponentPlayground :prop-defs="propDefs">
        <template #default="{ props: p }">
          <UiTextarea v-bind="p" v-model="playgroundValue" />
        </template>
      </ComponentPlayground>
    </section>

    <!-- Accessibility Audit -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Accessibility</h2>
      <ComponentTestRunner>
        <div class="max-w-lg space-y-4">
          <UiTextarea label="Description" placeholder="Write something…" :rows="3" />
          <UiTextarea label="Feedback" error="Please provide at least 20 characters" :rows="3" />
          <UiTextarea label="Disabled" disabled model-value="Cannot edit" :rows="3" />
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
