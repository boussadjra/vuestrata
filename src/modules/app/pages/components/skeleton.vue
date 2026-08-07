<script setup lang="ts">
import ComponentApiTable from '@/components/docs/ComponentApiTable.vue'
import type { ApiPropRow } from '@/components/docs/ComponentApiTable.vue'
import ComponentDemo from '@/components/docs/ComponentDemo.vue'
import ComponentPlayground from '@/components/docs/ComponentPlayground.vue'
import type { PropDef } from '@/components/docs/ComponentPlayground.vue'
import ComponentTestRunner from '@/components/docs/ComponentTestRunner.vue'

const propDefs: PropDef[] = [
  { name: 'width', type: 'string', default: '100%' },
  { name: 'height', type: 'string', default: '1rem' },
  {
    name: 'rounded',
    type: 'select',
    default: 'md',
    options: [
      { label: 'sm', value: 'sm' },
      { label: 'md', value: 'md' },
      { label: 'lg', value: 'lg' },
      { label: 'full', value: 'full' },
    ],
  },
  { name: 'animated', type: 'boolean', default: true },
]

const usageCode = `<UiSkeleton height="1rem" width="60%" />`

const shapesCode = `<div class="flex items-center gap-4">
  <UiSkeleton height="3rem" width="3rem" rounded="full" />
  <UiSkeleton height="3rem" width="3rem" rounded="lg" />
  <UiSkeleton height="3rem" width="3rem" rounded="sm" />
</div>
<UiSkeleton height="1.25rem" width="40%" rounded="full" />
<UiSkeleton height="1rem" width="100%" />
<UiSkeleton height="1rem" width="75%" />`

const cardCode = `<UiSkeleton height="8rem" width="100%" rounded="lg" />
<UiSkeleton height="1.25rem" width="60%" rounded="full" />
<UiSkeleton height="0.9rem" width="100%" />
<UiSkeleton height="0.9rem" width="80%" />`

const profileCode = `<div class="flex items-center gap-4">
  <UiSkeleton height="3rem" width="3rem" rounded="full" />
  <div class="flex-1 space-y-2">
    <UiSkeleton height="1rem" width="40%" rounded="full" />
    <UiSkeleton height="0.8rem" width="65%" />
  </div>
</div>`

const listCode = `<div v-for="i in 4" :key="i" class="flex items-center gap-3 py-3">
  <UiSkeleton height="2.5rem" width="2.5rem" rounded="full" />
  <div class="flex-1 space-y-1.5">
    <UiSkeleton height="0.9rem" :width="\`\${50 + i * 8}%\`" rounded="full" />
    <UiSkeleton height="0.75rem" :width="\`\${30 + i * 10}%\`" />
  </div>
</div>`

const staticCode = `<UiSkeleton height="1.25rem" width="50%" :animated="false" />
<UiSkeleton height="1rem" width="100%" :animated="false" />
<UiSkeleton height="1rem" width="70%" :animated="false" />`

const apiProps: ApiPropRow[] = [
  { name: 'width', type: 'string', default: "'100%'", description: 'CSS width value' },
  { name: 'height', type: 'string', default: "'1rem'", description: 'CSS height value' },
  {
    name: 'rounded',
    type: "'sm' | 'md' | 'lg' | 'full'",
    default: "'md'",
    description: 'Border radius preset',
  },
  { name: 'animated', type: 'boolean', default: 'true', description: 'Enable shimmer animation' },
]
</script>

<template>
  <div class="space-y-12">
    <header>
      <h1 class="mb-2 text-3xl font-bold">Skeleton</h1>
      <p class="text-muted-foreground text-lg">
        Placeholder loading states that mimic content layout before data arrives.
      </p>
    </header>

    <!-- Usage -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Usage</h2>
      <ComponentDemo :code="usageCode">
        <div class="max-w-lg">
          <UiSkeleton height="1rem" width="60%" />
        </div>
      </ComponentDemo>
    </section>

    <!-- Shapes -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Shapes</h2>
      <p class="text-surface-500 text-sm">
        Control shape via
        <code class="bg-surface-100 dark:bg-surface-800 rounded px-1.5 py-0.5 text-xs">rounded</code
        >,
        <code class="bg-surface-100 dark:bg-surface-800 rounded px-1.5 py-0.5 text-xs">width</code>,
        and
        <code class="bg-surface-100 dark:bg-surface-800 rounded px-1.5 py-0.5 text-xs">height</code>
        props.
      </p>
      <ComponentDemo :code="shapesCode">
        <div class="max-w-lg space-y-4">
          <div class="flex items-center gap-4">
            <UiSkeleton height="3rem" width="3rem" rounded="full" />
            <UiSkeleton height="3rem" width="3rem" rounded="lg" />
            <UiSkeleton height="3rem" width="3rem" rounded="sm" />
          </div>
          <UiSkeleton height="1.25rem" width="40%" rounded="full" />
          <UiSkeleton height="1rem" width="100%" />
          <UiSkeleton height="1rem" width="75%" />
        </div>
      </ComponentDemo>
    </section>

    <!-- Card Placeholder -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Card Placeholder</h2>
      <p class="text-surface-500 text-sm">Compose skeletons to mimic a card loading state.</p>
      <ComponentDemo :code="cardCode">
        <div class="max-w-sm space-y-3">
          <UiSkeleton height="8rem" width="100%" rounded="lg" />
          <UiSkeleton height="1.25rem" width="60%" rounded="full" />
          <UiSkeleton height="0.9rem" width="100%" />
          <UiSkeleton height="0.9rem" width="80%" />
        </div>
      </ComponentDemo>
    </section>

    <!-- User Profile Placeholder -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Profile Placeholder</h2>
      <ComponentDemo :code="profileCode">
        <div class="max-w-lg">
          <div class="flex items-center gap-4">
            <UiSkeleton height="3rem" width="3rem" rounded="full" />
            <div class="flex-1 space-y-2">
              <UiSkeleton height="1rem" width="40%" rounded="full" />
              <UiSkeleton height="0.8rem" width="65%" />
            </div>
          </div>
        </div>
      </ComponentDemo>
    </section>

    <!-- List Placeholder -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">List Placeholder</h2>
      <ComponentDemo :code="listCode">
        <div class="divide-surface-200 dark:divide-surface-700/60 max-w-lg divide-y">
          <div v-for="i in 4" :key="i" class="flex items-center gap-3 py-3">
            <UiSkeleton height="2.5rem" width="2.5rem" rounded="full" />
            <div class="flex-1 space-y-1.5">
              <UiSkeleton height="0.9rem" :width="`${50 + i * 8}%`" rounded="full" />
              <UiSkeleton height="0.75rem" :width="`${30 + i * 10}%`" />
            </div>
          </div>
        </div>
      </ComponentDemo>
    </section>

    <!-- Static (No Animation) -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Without Animation</h2>
      <p class="text-surface-500 text-sm">
        Set
        <code class="bg-surface-100 dark:bg-surface-800 rounded px-1.5 py-0.5 text-xs"
          >:animated="false"</code
        >
        to disable the shimmer effect.
      </p>
      <ComponentDemo :code="staticCode">
        <div class="max-w-lg space-y-3">
          <UiSkeleton height="1.25rem" width="50%" :animated="false" />
          <UiSkeleton height="1rem" width="100%" :animated="false" />
          <UiSkeleton height="1rem" width="70%" :animated="false" />
        </div>
      </ComponentDemo>
    </section>

    <!-- Playground -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Playground</h2>
      <ComponentPlayground :prop-defs="propDefs">
        <template #default="{ props: p }">
          <UiSkeleton v-bind="p" />
        </template>
      </ComponentPlayground>
    </section>

    <!-- Accessibility Audit -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Accessibility</h2>
      <ComponentTestRunner>
        <div class="max-w-lg space-y-3">
          <UiSkeleton height="1rem" width="60%" />
          <UiSkeleton height="3rem" width="3rem" rounded="full" />
          <UiSkeleton height="1rem" width="100%" :animated="false" />
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
