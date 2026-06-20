<script setup lang="ts">
import ComponentApiTable from '@/components/docs/ComponentApiTable.vue'
import type { ApiPropRow, ApiEventRow, ApiSlotRow } from '@/components/docs/ComponentApiTable.vue'
import ComponentDemo from '@/components/docs/ComponentDemo.vue'
import ComponentPlayground from '@/components/docs/ComponentPlayground.vue'
import type { PropDef, SlotDef } from '@/components/docs/ComponentPlayground.vue'
import ComponentTestRunner from '@/components/docs/ComponentTestRunner.vue'

const activeTab = ref('center')
const loading = ref(false)

function simulateLoading() {
  loading.value = true
  setTimeout(() => (loading.value = false), 2000)
}

const propDefs: PropDef[] = [
  {
    name: 'variant',
    type: 'select',
    default: 'primary',
    options: [
      { label: 'primary', value: 'primary' },
      { label: 'secondary', value: 'secondary' },
      { label: 'accent', value: 'accent' },
      { label: 'ghost', value: 'ghost' },
      { label: 'destructive', value: 'destructive' },
    ],
  },
  {
    name: 'size',
    type: 'select',
    default: 'md',
    options: [
      { label: 'xs', value: 'xs' },
      { label: 'sm', value: 'sm' },
      { label: 'md', value: 'md' },
      { label: 'lg', value: 'lg' },
      { label: 'xl', value: 'xl' },
    ],
  },
  { name: 'disabled', type: 'boolean', default: false },
  { name: 'loading', type: 'boolean', default: false },
  { name: 'block', type: 'boolean', default: false },
]

const slotDefs: SlotDef[] = [{ name: 'default', default: 'Click me' }]

const usageCode = `<UiButton variant="primary">Click me</UiButton>`

const variantsCode = `<UiButton variant="primary">Primary</UiButton>
<UiButton variant="secondary">Secondary</UiButton>
<UiButton variant="accent">Accent</UiButton>
<UiButton variant="ghost">Ghost</UiButton>
<UiButton variant="destructive">Destructive</UiButton>`

const sizesCode = `<UiButton variant="primary" size="xs">Extra Small</UiButton>
<UiButton variant="primary" size="sm">Small</UiButton>
<UiButton variant="primary" size="md">Medium</UiButton>
<UiButton variant="primary" size="lg">Large</UiButton>
<UiButton variant="primary" size="xl">Extra Large</UiButton>`

const statesCode = `<UiButton variant="primary" :loading="loading" @click="simulateLoading">
  {{ loading ? 'Saving…' : 'Click to load' }}
</UiButton>
<UiButton variant="primary" loading>Always loading</UiButton>
<UiButton variant="primary" disabled>Disabled</UiButton>`

const blockCode = `<UiButton variant="primary" block>Full Width Button</UiButton>`

const iconCode = `<UiButton variant="primary" icon="i-solar-add-circle-linear">Add Item</UiButton>
<UiButton variant="secondary" icon="i-solar-download-minimalistic-linear">Download</UiButton>
<UiButton variant="ghost" icon="i-solar-settings-linear">Settings</UiButton>`

const groupCode = `<UiButtonGroup v-model="activeTab">
  <UiButton variant="ghost" value="left">Left</UiButton>
  <UiButton variant="ghost" value="center">Center</UiButton>
  <UiButton variant="ghost" value="right">Right</UiButton>
</UiButtonGroup>`

const apiProps: ApiPropRow[] = [
  {
    name: 'variant',
    type: "'primary' | 'secondary' | 'accent' | 'ghost' | 'destructive'",
    default: "'primary'",
    description: 'Visual style variant',
  },
  {
    name: 'size',
    type: "'xs' | 'sm' | 'md' | 'lg' | 'xl'",
    default: "'md'",
    description: 'Button size',
  },
  { name: 'disabled', type: 'boolean', default: 'false', description: 'Disables the button' },
  { name: 'loading', type: 'boolean', default: 'false', description: 'Shows a loading spinner' },
  { name: 'block', type: 'boolean', default: 'false', description: 'Makes the button full width' },
  {
    name: 'icon',
    type: 'string | boolean',
    default: 'false',
    description: 'Icon class to display, or boolean for icon-only square style',
  },
  {
    name: 'value',
    type: 'string | number | boolean | null',
    description: 'Value when used inside a UiButtonGroup',
  },
  {
    name: 'active',
    type: 'boolean',
    default: 'false',
    description: 'Forces the button into an active state',
  },
  {
    name: 'type',
    type: "'button' | 'submit' | 'reset'",
    default: "'button'",
    description: 'HTML button type',
  },
]

const apiEvents: ApiEventRow[] = [
  { name: 'click', payload: 'MouseEvent', description: 'Emitted when the button is clicked' },
]

const apiSlots: ApiSlotRow[] = [{ name: 'default', description: 'Button label content' }]

const groupApiProps: ApiPropRow[] = [
  {
    name: 'modelValue',
    type: 'string | number | boolean | null | Array<string | number | boolean | null>',
    description: 'Currently selected value (use v-model)',
  },
  {
    name: 'multiple',
    type: 'boolean',
    default: 'false',
    description: 'Allows multiple buttons to be active simultaneously',
  },
  {
    name: 'deselectable',
    type: 'boolean',
    default: 'false',
    description: 'Allows deselecting the current value by clicking it again',
  },
  {
    name: 'ariaLabel',
    type: 'string',
    description: 'Accessible label for the button group (required for screen readers)',
  },
]

const groupApiSlots: ApiSlotRow[] = [
  { name: 'default', description: 'UiButton elements that form the group' },
]
</script>

<template>
  <div class="space-y-12">
    <header>
      <h1 class="mb-2 text-3xl font-bold">Button</h1>
      <p class="text-surface-500 dark:text-surface-400 text-lg">
        Trigger actions with configurable variants, sizes, and states.
      </p>
    </header>

    <!-- Usage -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Usage</h2>
      <ComponentDemo :code="usageCode">
        <UiButton variant="primary">Click me</UiButton>
      </ComponentDemo>
    </section>

    <!-- Variants -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Variants</h2>
      <p class="text-surface-500 text-sm">
        Use the
        <code class="bg-surface-100 dark:bg-surface-800 rounded px-1.5 py-0.5 text-xs"
          >variant</code
        >
        prop to change the visual style.
      </p>
      <ComponentDemo :code="variantsCode">
        <div class="flex flex-wrap gap-3">
          <UiButton variant="primary">Primary</UiButton>
          <UiButton variant="secondary">Secondary</UiButton>
          <UiButton variant="accent">Accent</UiButton>
          <UiButton variant="ghost">Ghost</UiButton>
          <UiButton variant="destructive">Destructive</UiButton>
        </div>
      </ComponentDemo>
    </section>

    <!-- Sizes -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Sizes</h2>
      <p class="text-surface-500 text-sm">
        Use the
        <code class="bg-surface-100 dark:bg-surface-800 rounded px-1.5 py-0.5 text-xs">size</code>
        prop to control the button dimensions.
      </p>
      <ComponentDemo :code="sizesCode">
        <div class="flex flex-wrap items-center gap-3">
          <UiButton variant="primary" size="xs">Extra Small</UiButton>
          <UiButton variant="primary" size="sm">Small</UiButton>
          <UiButton variant="primary" size="md">Medium</UiButton>
          <UiButton variant="primary" size="lg">Large</UiButton>
          <UiButton variant="primary" size="xl">Extra Large</UiButton>
        </div>
      </ComponentDemo>
    </section>

    <!-- States -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">States</h2>
      <ComponentDemo :code="statesCode">
        <div class="flex flex-wrap items-center gap-3">
          <UiButton variant="primary" :loading="loading" @click="simulateLoading">
            {{ loading ? 'Saving…' : 'Click to load' }}
          </UiButton>
          <UiButton variant="primary" loading>Always loading</UiButton>
          <UiButton variant="primary" disabled>Disabled</UiButton>
        </div>
      </ComponentDemo>
    </section>

    <!-- Block -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Full Width</h2>
      <p class="text-surface-500 text-sm">
        Use the
        <code class="bg-surface-100 dark:bg-surface-800 rounded px-1.5 py-0.5 text-xs">block</code>
        prop to make the button span full width.
      </p>
      <ComponentDemo :code="blockCode">
        <div class="max-w-md">
          <UiButton variant="primary" block>Full Width Button</UiButton>
        </div>
      </ComponentDemo>
    </section>

    <!-- With Icon -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">With Icon</h2>
      <ComponentDemo :code="iconCode">
        <div class="flex flex-wrap gap-3">
          <UiButton variant="primary" icon="i-solar-add-circle-linear">Add Item</UiButton>
          <UiButton variant="secondary" icon="i-solar-download-minimalistic-linear"
            >Download</UiButton
          >
          <UiButton variant="ghost" icon="i-solar-settings-linear">Settings</UiButton>
        </div>
      </ComponentDemo>
    </section>

    <!-- Button Group -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Button Group</h2>
      <p class="text-surface-500 text-sm">Combine buttons together for related actions.</p>
      <ComponentDemo :code="groupCode">
        <UiButtonGroup v-model="activeTab">
          <UiButton variant="ghost" value="left">Left</UiButton>
          <UiButton variant="ghost" value="center">Center</UiButton>
          <UiButton variant="ghost" value="right">Right</UiButton>
        </UiButtonGroup>
      </ComponentDemo>
    </section>

    <!-- Playground -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Playground</h2>
      <ComponentPlayground :prop-defs="propDefs" :slot-defs="slotDefs">
        <template #default="{ props: p, slots: s }">
          <UiButton v-bind="p">{{ s.default }}</UiButton>
        </template>
      </ComponentPlayground>
    </section>

    <!-- Accessibility Audit -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Accessibility</h2>
      <p class="text-surface-500 text-sm">
        The interactive test below runs an automated accessibility audit using axe-core, checking
        for WCAG compliance (contrast, ARIA labels, keyboard navigation, semantic HTML). A passing
        audit confirms the component meets baseline accessibility standards.
      </p>
      <ComponentTestRunner>
        <div class="flex flex-wrap gap-3">
          <UiButton variant="primary">Primary</UiButton>
          <UiButton variant="secondary">Secondary</UiButton>
          <UiButton variant="ghost">Ghost</UiButton>
          <UiButton variant="primary" disabled>Disabled</UiButton>
          <UiButton variant="primary" loading>Loading</UiButton>
        </div>
      </ComponentTestRunner>
    </section>

    <!-- API Reference -->
    <ComponentApiTable :props="apiProps" :events="apiEvents" :slots="apiSlots" />

    <!-- ButtonGroup API Reference -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">UiButtonGroup API</h2>
      <ComponentApiTable :props="groupApiProps" :slots="groupApiSlots" />
    </section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: components
</route>
