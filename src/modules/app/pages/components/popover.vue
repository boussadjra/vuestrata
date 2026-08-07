<script setup lang="ts">
import ComponentApiTable from '@/components/docs/ComponentApiTable.vue'
import type { ApiPropRow, ApiSlotRow } from '@/components/docs/ComponentApiTable.vue'
import ComponentDemo from '@/components/docs/ComponentDemo.vue'
import ComponentPlayground from '@/components/docs/ComponentPlayground.vue'
import type { PropDef } from '@/components/docs/ComponentPlayground.vue'
import ComponentTestRunner from '@/components/docs/ComponentTestRunner.vue'

const propDefs: PropDef[] = [
  {
    name: 'side',
    type: 'select',
    default: 'bottom',
    options: [
      { label: 'top', value: 'top' },
      { label: 'right', value: 'right' },
      { label: 'bottom', value: 'bottom' },
      { label: 'left', value: 'left' },
    ],
  },
  {
    name: 'align',
    type: 'select',
    default: 'center',
    options: [
      { label: 'start', value: 'start' },
      { label: 'center', value: 'center' },
      { label: 'end', value: 'end' },
    ],
  },
]

const usageCode = `<UiPopover>
  <template #trigger>
    <UiButton>Open Popover</UiButton>
  </template>
  <div class="p-2 space-y-2">
    <h4 class="text-sm font-semibold">Popover Title</h4>
    <p class="text-xs text-surface-500">This is a basic popover with some content inside.</p>
  </div>
</UiPopover>`

const placementCode = `<UiPopover side="top">
  <template #trigger><UiButton variant="secondary">Top</UiButton></template>
  <p class="p-2 text-xs">Popover on top</p>
</UiPopover>

<UiPopover side="right">
  <template #trigger><UiButton variant="secondary">Right</UiButton></template>
  <p class="p-2 text-xs">Popover on right</p>
</UiPopover>

<UiPopover side="bottom">
  <template #trigger><UiButton variant="secondary">Bottom</UiButton></template>
  <p class="p-2 text-xs">Popover on bottom</p>
</UiPopover>

<UiPopover side="left">
  <template #trigger><UiButton variant="secondary">Left</UiButton></template>
  <p class="p-2 text-xs">Popover on left</p>
</UiPopover>`

const alignmentCode = `<UiPopover side="bottom" align="start">
  <template #trigger><UiButton variant="ghost">Align Start</UiButton></template>
  <p class="p-2 text-xs">Aligned to start</p>
</UiPopover>

<UiPopover side="bottom" align="center">
  <template #trigger><UiButton variant="ghost">Align Center</UiButton></template>
  <p class="p-2 text-xs">Aligned to center</p>
</UiPopover>

<UiPopover side="bottom" align="end">
  <template #trigger><UiButton variant="ghost">Align End</UiButton></template>
  <p class="p-2 text-xs">Aligned to end</p>
</UiPopover>`

const richContentCode = `<UiPopover>
  <template #trigger>
    <UiButton>User Info</UiButton>
  </template>
  <div class="p-3 space-y-3 w-64">
    <div class="flex items-center gap-3">
      <UiAvatar initials="JD" size="md" />
      <div>
        <p class="text-sm font-semibold">Jane Doe</p>
        <p class="text-xs text-surface-500">jane@example.com</p>
      </div>
    </div>
    <UiSeparator />
    <div class="text-xs text-surface-500 space-y-1">
      <p>Role: Administrator</p>
      <p>Joined: Jan 2024</p>
    </div>
  </div>
</UiPopover>`

const apiProps: ApiPropRow[] = [
  {
    name: 'side',
    type: "'top' | 'right' | 'bottom' | 'left'",
    default: "'bottom'",
    description: 'Preferred placement',
  },
  {
    name: 'align',
    type: "'start' | 'center' | 'end'",
    default: "'center'",
    description: 'Alignment relative to trigger',
  },
]

const apiSlots: ApiSlotRow[] = [
  { name: 'trigger', description: 'Element that toggles the popover' },
  { name: 'default', description: 'Popover content' },
]
</script>

<template>
  <div class="space-y-12">
    <header>
      <h1 class="mb-2 text-3xl font-bold">Popover</h1>
      <p class="text-muted-foreground text-lg">
        A floating panel anchored to a trigger element, ideal for contextual content.
      </p>
    </header>

    <!-- Usage -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Usage</h2>
      <ComponentDemo :code="usageCode">
        <UiPopover>
          <template #trigger>
            <UiButton>Open Popover</UiButton>
          </template>
          <div class="space-y-2 p-2">
            <h4 class="text-sm font-semibold">Popover Title</h4>
            <p class="text-surface-500 text-xs">
              This is a basic popover with some content inside.
            </p>
          </div>
        </UiPopover>
      </ComponentDemo>
    </section>

    <!-- Placement -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Placement</h2>
      <ComponentDemo :code="placementCode">
        <div class="flex flex-wrap items-center gap-4">
          <UiPopover side="top">
            <template #trigger>
              <UiButton variant="secondary">Top</UiButton>
            </template>
            <p class="p-2 text-xs">Popover on top</p>
          </UiPopover>

          <UiPopover side="right">
            <template #trigger>
              <UiButton variant="secondary">Right</UiButton>
            </template>
            <p class="p-2 text-xs">Popover on right</p>
          </UiPopover>

          <UiPopover side="bottom">
            <template #trigger>
              <UiButton variant="secondary">Bottom</UiButton>
            </template>
            <p class="p-2 text-xs">Popover on bottom</p>
          </UiPopover>

          <UiPopover side="left">
            <template #trigger>
              <UiButton variant="secondary">Left</UiButton>
            </template>
            <p class="p-2 text-xs">Popover on left</p>
          </UiPopover>
        </div>
      </ComponentDemo>
    </section>

    <!-- Alignment -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Alignment</h2>
      <ComponentDemo :code="alignmentCode">
        <div class="flex flex-wrap items-center gap-4">
          <UiPopover side="bottom" align="start">
            <template #trigger>
              <UiButton variant="ghost">Align Start</UiButton>
            </template>
            <p class="p-2 text-xs">Aligned to start</p>
          </UiPopover>

          <UiPopover side="bottom" align="center">
            <template #trigger>
              <UiButton variant="ghost">Align Center</UiButton>
            </template>
            <p class="p-2 text-xs">Aligned to center</p>
          </UiPopover>

          <UiPopover side="bottom" align="end">
            <template #trigger>
              <UiButton variant="ghost">Align End</UiButton>
            </template>
            <p class="p-2 text-xs">Aligned to end</p>
          </UiPopover>
        </div>
      </ComponentDemo>
    </section>

    <!-- Rich Content -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Rich Content</h2>
      <ComponentDemo :code="richContentCode">
        <UiPopover>
          <template #trigger>
            <UiButton>User Info</UiButton>
          </template>
          <div class="w-64 space-y-3 p-3">
            <div class="flex items-center gap-3">
              <UiAvatar initials="JD" size="md" />
              <div>
                <p class="text-sm font-semibold">Jane Doe</p>
                <p class="text-surface-500 text-xs">jane@example.com</p>
              </div>
            </div>
            <UiSeparator />
            <div class="text-surface-500 space-y-1 text-xs">
              <p>Role: Administrator</p>
              <p>Joined: Jan 2024</p>
            </div>
          </div>
        </UiPopover>
      </ComponentDemo>
    </section>

    <!-- Playground -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Playground</h2>
      <ComponentPlayground :prop-defs="propDefs">
        <template #default="{ props: p }">
          <UiPopover v-bind="p">
            <template #trigger>
              <UiButton variant="secondary">Open Popover</UiButton>
            </template>
            <div class="p-2">
              <p class="text-surface-500 text-xs">Popover content preview</p>
            </div>
          </UiPopover>
        </template>
      </ComponentPlayground>
    </section>

    <!-- Accessibility -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Accessibility</h2>
      <ComponentTestRunner>
        <UiPopover>
          <template #trigger>
            <UiButton>Open Popover</UiButton>
          </template>
          <p class="p-2 text-xs">Basic popover content</p>
        </UiPopover>
        <UiPopover side="top">
          <template #trigger>
            <UiButton variant="secondary">Top Popover</UiButton>
          </template>
          <p class="p-2 text-xs">Popover on top</p>
        </UiPopover>
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
