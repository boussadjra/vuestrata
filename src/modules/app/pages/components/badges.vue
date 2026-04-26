<script setup lang="ts">
import ComponentApiTable from '@/components/docs/ComponentApiTable.vue'
import type { ApiPropRow, ApiSlotRow } from '@/components/docs/ComponentApiTable.vue'
import ComponentDemo from '@/components/docs/ComponentDemo.vue'
import ComponentPlayground from '@/components/docs/ComponentPlayground.vue'
import type { PropDef, SlotDef } from '@/components/docs/ComponentPlayground.vue'
import ComponentTestRunner from '@/components/docs/ComponentTestRunner.vue'

const propDefs: PropDef[] = [
  {
    name: 'variant',
    type: 'select',
    default: 'default',
    options: [
      { label: 'default', value: 'default' },
      { label: 'primary', value: 'primary' },
      { label: 'secondary', value: 'secondary' },
      { label: 'success', value: 'success' },
      { label: 'warning', value: 'warning' },
      { label: 'error', value: 'error' },
    ],
  },
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
  { name: 'dot', type: 'boolean', default: false },
]

const slotDefs: SlotDef[] = [{ name: 'default', default: 'Badge' }]

const usageCode = `<UiBadge>Default</UiBadge>`

const variantsCode = `<UiBadge>Default</UiBadge>
<UiBadge variant="primary">Primary</UiBadge>
<UiBadge variant="secondary">Secondary</UiBadge>
<UiBadge variant="success">Success</UiBadge>
<UiBadge variant="warning">Warning</UiBadge>
<UiBadge variant="error">Error</UiBadge>`

const sizesCode = `<UiBadge variant="primary" size="sm">Small</UiBadge>
<UiBadge variant="primary" size="md">Medium</UiBadge>
<UiBadge variant="primary" size="lg">Large</UiBadge>`

const dotCode = `<UiBadge variant="success" dot>Online</UiBadge>
<UiBadge variant="warning" dot>Away</UiBadge>
<UiBadge variant="error" dot>Offline</UiBadge>
<UiBadge dot>Idle</UiBadge>`

const patternsCode = `<div class="flex items-center gap-3">
  <span class="text-sm font-medium">Status:</span>
  <UiBadge variant="success" dot>Active</UiBadge>
</div>
<div class="flex items-center gap-3">
  <span class="text-sm font-medium">Tags:</span>
  <UiBadge variant="primary" size="sm">Vue</UiBadge>
  <UiBadge variant="secondary" size="sm">TypeScript</UiBadge>
  <UiBadge size="sm">Tailwind</UiBadge>
</div>
<div class="flex items-center gap-3">
  <span class="text-sm font-medium">Count:</span>
  <UiBadge variant="error" size="sm">3</UiBadge>
  <span class="text-xs text-surface-500">new notifications</span>
</div>`

const apiProps: ApiPropRow[] = [
  {
    name: 'variant',
    type: "'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error'",
    default: "'default'",
    description: 'Badge color variant',
  },
  { name: 'size', type: "'sm' | 'md' | 'lg'", default: "'md'", description: 'Badge size' },
  { name: 'dot', type: 'boolean', default: 'false', description: 'Show a dot indicator' },
]

const apiSlots: ApiSlotRow[] = [{ name: 'default', description: 'Badge label content' }]
</script>

<template>
  <div class="space-y-12">
    <header>
      <h1 class="mb-2 text-3xl font-bold">Badge</h1>
      <p class="text-surface-500 dark:text-surface-400 text-lg">
        Compact status indicators and labels with variants, sizes, and dot indicators.
      </p>
    </header>

    <!-- Usage -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Usage</h2>
      <ComponentDemo :code="usageCode">
        <UiBadge>Default</UiBadge>
      </ComponentDemo>
    </section>

    <!-- Variants -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Variants</h2>
      <ComponentDemo :code="variantsCode">
        <div class="flex flex-wrap gap-3">
          <UiBadge>Default</UiBadge>
          <UiBadge variant="primary">Primary</UiBadge>
          <UiBadge variant="secondary">Secondary</UiBadge>
          <UiBadge variant="success">Success</UiBadge>
          <UiBadge variant="warning">Warning</UiBadge>
          <UiBadge variant="error">Error</UiBadge>
        </div>
      </ComponentDemo>
    </section>

    <!-- Sizes -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Sizes</h2>
      <ComponentDemo :code="sizesCode">
        <div class="flex flex-wrap items-center gap-3">
          <UiBadge variant="primary" size="sm">Small</UiBadge>
          <UiBadge variant="primary" size="md">Medium</UiBadge>
          <UiBadge variant="primary" size="lg">Large</UiBadge>
        </div>
      </ComponentDemo>
    </section>

    <!-- With Dot -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">With Dot Indicator</h2>
      <p class="text-surface-500 text-sm">
        Add a dot indicator for live status using the
        <code class="bg-surface-100 dark:bg-surface-800 rounded px-1.5 py-0.5 text-xs">dot</code>
        prop.
      </p>
      <ComponentDemo :code="dotCode">
        <div class="flex flex-wrap gap-3">
          <UiBadge variant="success" dot>Online</UiBadge>
          <UiBadge variant="warning" dot>Away</UiBadge>
          <UiBadge variant="error" dot>Offline</UiBadge>
          <UiBadge dot>Idle</UiBadge>
        </div>
      </ComponentDemo>
    </section>

    <!-- Use Cases -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Common Patterns</h2>
      <ComponentDemo :code="patternsCode">
        <div class="space-y-4">
          <div class="flex items-center gap-3">
            <span class="text-sm font-medium">Status:</span>
            <UiBadge variant="success" dot>Active</UiBadge>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-sm font-medium">Tags:</span>
            <UiBadge variant="primary" size="sm">Vue</UiBadge>
            <UiBadge variant="secondary" size="sm">TypeScript</UiBadge>
            <UiBadge size="sm">Tailwind</UiBadge>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-sm font-medium">Count:</span>
            <UiBadge variant="error" size="sm">3</UiBadge>
            <span class="text-surface-500 text-xs">new notifications</span>
          </div>
        </div>
      </ComponentDemo>
    </section>

    <!-- Playground -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Playground</h2>
      <ComponentPlayground :prop-defs="propDefs" :slot-defs="slotDefs">
        <template #default="{ props: p, slots: s }">
          <UiBadge v-bind="p">{{ s.default }}</UiBadge>
        </template>
      </ComponentPlayground>
    </section>

    <!-- Accessibility Audit -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Accessibility</h2>
      <ComponentTestRunner>
        <div class="flex flex-wrap gap-3">
          <UiBadge variant="primary">Primary</UiBadge>
          <UiBadge variant="success" dot>Online</UiBadge>
          <UiBadge variant="error" size="sm">3</UiBadge>
        </div>
      </ComponentTestRunner>
    </section>

    <!-- API Reference -->
    <ComponentApiTable :props="apiProps" :slots="apiSlots" />
  </div>
</template>

<route lang="yaml">
meta:
  layout: components
</route>
