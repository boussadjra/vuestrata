<script setup lang="ts">
import ComponentApiTable from '@/components/docs/ComponentApiTable.vue'
import type { ApiPropRow } from '@/components/docs/ComponentApiTable.vue'
import ComponentDemo from '@/components/docs/ComponentDemo.vue'
import ComponentPlayground from '@/components/docs/ComponentPlayground.vue'
import type { PropDef } from '@/components/docs/ComponentPlayground.vue'
import ComponentTestRunner from '@/components/docs/ComponentTestRunner.vue'

const animated = ref(68)

function randomize() {
  animated.value = Math.floor(Math.random() * 100)
}

const propDefs: PropDef[] = [
  { name: 'value', type: 'number', default: 45 },
  { name: 'max', type: 'number', default: 100 },
  { name: 'label', type: 'string', default: 'Progress' },
  { name: 'showValue', type: 'boolean', default: false },
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

const usageCode = `<UiProgress :value="45" />`

const labelCode = `<UiProgress label="Build pipeline" :value="34" show-value />
<UiProgress label="Unit tests" :value="78" show-value />
<UiProgress label="Release readiness" :value="92" show-value />`

const sizesCode = `<UiProgress label="Small" :value="60" show-value size="sm" />
<UiProgress label="Medium (default)" :value="60" show-value size="md" />
<UiProgress label="Large" :value="60" show-value size="lg" />`

const animatedCode = `<UiProgress label="Progress" :value="animated" show-value size="lg" />
<UiButton variant="secondary" size="sm" @click="randomize">Randomize</UiButton>`

const edgeCode = `<UiProgress label="Empty" :value="0" show-value />
<UiProgress label="Quarter" :value="25" show-value />
<UiProgress label="Half" :value="50" show-value />
<UiProgress label="Full" :value="100" show-value />`

const apiProps: ApiPropRow[] = [
  { name: 'value', type: 'number', default: '0', description: 'Current progress value' },
  { name: 'max', type: 'number', default: '100', description: 'Maximum value' },
  { name: 'label', type: 'string', description: 'Progress label' },
  { name: 'showValue', type: 'boolean', default: 'false', description: 'Show percentage value' },
  { name: 'size', type: "'sm' | 'md' | 'lg'", default: "'md'", description: 'Progress bar height' },
]
</script>

<template>
  <div class="space-y-12">
    <header>
      <h1 class="mb-2 text-3xl font-bold">Progress</h1>
      <p class="text-muted-foreground text-lg">
        Determinate progress indicator with label, value display, and multiple sizes.
      </p>
    </header>

    <!-- Usage -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Usage</h2>
      <ComponentDemo :code="usageCode">
        <div class="max-w-lg">
          <UiProgress :value="45" />
        </div>
      </ComponentDemo>
    </section>

    <!-- With Label & Value -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Label &amp; Value</h2>
      <ComponentDemo :code="labelCode">
        <div class="max-w-lg space-y-4">
          <UiProgress label="Build pipeline" :value="34" show-value />
          <UiProgress label="Unit tests" :value="78" show-value />
          <UiProgress label="Release readiness" :value="92" show-value />
        </div>
      </ComponentDemo>
    </section>

    <!-- Sizes -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Sizes</h2>
      <ComponentDemo :code="sizesCode">
        <div class="max-w-lg space-y-4">
          <UiProgress label="Small" :value="60" show-value size="sm" />
          <UiProgress label="Medium (default)" :value="60" show-value size="md" />
          <UiProgress label="Large" :value="60" show-value size="lg" />
        </div>
      </ComponentDemo>
    </section>

    <!-- Animated -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Animated Value</h2>
      <p class="text-surface-500 text-sm">Click the button to see the progress bar animate.</p>
      <ComponentDemo :code="animatedCode">
        <div class="max-w-lg space-y-4">
          <UiProgress label="Progress" :value="animated" show-value size="lg" />
          <UiButton variant="secondary" size="sm" @click="randomize">Randomize</UiButton>
        </div>
      </ComponentDemo>
    </section>

    <!-- Values at Boundaries -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Edge Values</h2>
      <ComponentDemo :code="edgeCode">
        <div class="max-w-lg space-y-4">
          <UiProgress label="Empty" :value="0" show-value />
          <UiProgress label="Quarter" :value="25" show-value />
          <UiProgress label="Half" :value="50" show-value />
          <UiProgress label="Full" :value="100" show-value />
        </div>
      </ComponentDemo>
    </section>

    <!-- Playground -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Playground</h2>
      <ComponentPlayground :prop-defs="propDefs">
        <template #default="{ props: p }">
          <div class="w-full max-w-lg">
            <UiProgress v-bind="p" />
          </div>
        </template>
      </ComponentPlayground>
    </section>

    <!-- Accessibility Audit -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Accessibility</h2>
      <ComponentTestRunner>
        <div class="max-w-lg space-y-4">
          <UiProgress :value="45" />
          <UiProgress label="With label" :value="70" show-value />
          <UiProgress label="Complete" :value="100" show-value />
        </div>
      </ComponentTestRunner>
    </section>

    <!-- API Reference -->
    <ComponentApiTable :props="apiProps" />
  </div>
</template>

<route lang="yaml">
meta:
  layout: components
</route>
