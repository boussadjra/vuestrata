<script setup lang="ts">
import ComponentApiTable from '@/components/docs/ComponentApiTable.vue'
import type { ApiPropRow, ApiSlotRow } from '@/components/docs/ComponentApiTable.vue'
import ComponentDemo from '@/components/docs/ComponentDemo.vue'
import ComponentPlayground from '@/components/docs/ComponentPlayground.vue'
import type { PropDef } from '@/components/docs/ComponentPlayground.vue'
import ComponentTestRunner from '@/components/docs/ComponentTestRunner.vue'

const usageCode = `<p>Content above the separator.</p>
<UiSeparator />
<p>Content below the separator.</p>`

const horizontalCode = `<div class="space-y-1">
  <h3 class="text-base font-semibold">Section Title</h3>
  <p class="text-sm text-surface-500">A brief description.</p>
</div>
<UiSeparator />
<div class="space-y-1">
  <h3 class="text-base font-semibold">Another Section</h3>
  <p class="text-sm text-surface-500">More content follows.</p>
</div>`

const verticalCode = `<div class="flex items-center gap-4 h-8">
  <span>Home</span>
  <UiSeparator orientation="vertical" />
  <span>Products</span>
  <UiSeparator orientation="vertical" />
  <span>About</span>
  <UiSeparator orientation="vertical" />
  <span>Contact</span>
</div>`

const labelCode = `<p>Sign in with your email or use a social provider.</p>
<UiSeparator label="or" />
<div class="flex gap-3">
  <UiButton variant="secondary">Google</UiButton>
  <UiButton variant="secondary">GitHub</UiButton>
</div>`

const decorativeCode = `<p>Some text content.</p>
<UiSeparator decorative />
<p>More text content.</p>`

const propDefs: PropDef[] = [
  {
    name: 'orientation',
    type: 'select',
    default: 'horizontal',
    options: [
      { label: 'horizontal', value: 'horizontal' },
      { label: 'vertical', value: 'vertical' },
    ],
  },
  { name: 'decorative', type: 'boolean', default: false },
  { name: 'label', type: 'string', default: '' },
]

const apiProps: ApiPropRow[] = [
  {
    name: 'orientation',
    type: "'horizontal' | 'vertical'",
    default: "'horizontal'",
    description: 'Separator direction',
  },
  {
    name: 'decorative',
    type: 'boolean',
    default: 'false',
    description: 'Renders as decorative (role="none")',
  },
  { name: 'label', type: 'string', description: 'Optional centered text label' },
]

const apiSlots: ApiSlotRow[] = [{ name: 'default', description: 'Custom label content' }]
</script>

<template>
  <div class="space-y-12">
    <header>
      <h1 class="mb-2 text-3xl font-bold">Separator</h1>
      <p class="text-surface-500 dark:text-surface-400 text-lg">
        A visual divider between content sections, supporting horizontal and vertical orientations.
      </p>
    </header>

    <!-- Usage -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Usage</h2>
      <ComponentDemo :code="usageCode">
        <div>
          <p class="mb-4">Content above the separator.</p>
          <UiSeparator />
          <p class="mt-4">Content below the separator.</p>
        </div>
      </ComponentDemo>
    </section>

    <!-- Horizontal -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Horizontal (default)</h2>
      <ComponentDemo :code="horizontalCode">
        <div class="space-y-4">
          <div class="space-y-1">
            <h3 class="text-base font-semibold">Section Title</h3>
            <p class="text-surface-500 text-sm">A brief description of this section.</p>
          </div>
          <UiSeparator />
          <div class="space-y-1">
            <h3 class="text-base font-semibold">Another Section</h3>
            <p class="text-surface-500 text-sm">More content follows here.</p>
          </div>
          <UiSeparator />
          <div class="space-y-1">
            <h3 class="text-base font-semibold">Final Section</h3>
            <p class="text-surface-500 text-sm">The last piece of content.</p>
          </div>
        </div>
      </ComponentDemo>
    </section>

    <!-- Vertical -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Vertical</h2>
      <ComponentDemo :code="verticalCode">
        <div class="flex h-8 items-center gap-4">
          <span class="text-sm font-medium">Home</span>
          <UiSeparator orientation="vertical" />
          <span class="text-sm font-medium">Products</span>
          <UiSeparator orientation="vertical" />
          <span class="text-sm font-medium">About</span>
          <UiSeparator orientation="vertical" />
          <span class="text-sm font-medium">Contact</span>
        </div>
      </ComponentDemo>
    </section>

    <!-- With Label -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">With Label</h2>
      <ComponentDemo :code="labelCode">
        <div class="space-y-4">
          <p class="text-surface-500 text-sm">Sign in with your email or use a social provider.</p>
          <UiSeparator label="or" />
          <div class="flex gap-3">
            <UiButton variant="secondary">Google</UiButton>
            <UiButton variant="secondary">GitHub</UiButton>
          </div>
        </div>
      </ComponentDemo>
    </section>

    <!-- Decorative -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Decorative</h2>
      <p class="text-surface-500 text-sm">
        A decorative separator is purely visual and has
        <code class="bg-surface-100 dark:bg-surface-800 rounded px-1.5 py-0.5 text-xs"
          >role="none"</code
        >
        instead of
        <code class="bg-surface-100 dark:bg-surface-800 rounded px-1.5 py-0.5 text-xs"
          >role="separator"</code
        >.
      </p>
      <ComponentDemo :code="decorativeCode">
        <div class="space-y-4">
          <p>Some text content.</p>
          <UiSeparator decorative />
          <p>More text content.</p>
        </div>
      </ComponentDemo>
    </section>

    <!-- Playground -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Playground</h2>
      <ComponentPlayground :prop-defs="propDefs">
        <template #default="{ props: p }">
          <div class="w-full space-y-4">
            <p class="text-sm">Content above</p>
            <UiSeparator v-bind="p" />
            <p class="text-sm">Content below</p>
          </div>
        </template>
      </ComponentPlayground>
    </section>

    <!-- Accessibility -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Accessibility</h2>
      <ComponentTestRunner>
        <div class="space-y-4">
          <UiSeparator />
          <UiSeparator label="or" />
          <UiSeparator decorative />
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
