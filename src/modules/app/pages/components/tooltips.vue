<script setup lang="ts">
import ComponentApiTable from '@/components/docs/ComponentApiTable.vue'
import type { ApiPropRow, ApiSlotRow } from '@/components/docs/ComponentApiTable.vue'
import ComponentDemo from '@/components/docs/ComponentDemo.vue'
import ComponentPlayground from '@/components/docs/ComponentPlayground.vue'
import type { PropDef } from '@/components/docs/ComponentPlayground.vue'
import ComponentTestRunner from '@/components/docs/ComponentTestRunner.vue'
import { resolveIcon } from '@/config/icon-provider'

const usageCode = `<UiTooltip content="Hello from tooltip">
  <UiButton variant="secondary">Hover me</UiButton>
</UiTooltip>`

const placementCode = `<UiTooltip content="Tooltip on top" side="top">
  <UiButton variant="ghost">Top</UiButton>
</UiTooltip>
<UiTooltip content="Tooltip on right" side="right">
  <UiButton variant="ghost">Right</UiButton>
</UiTooltip>
<UiTooltip content="Tooltip on bottom" side="bottom">
  <UiButton variant="ghost">Bottom</UiButton>
</UiTooltip>
<UiTooltip content="Tooltip on left" side="left">
  <UiButton variant="ghost">Left</UiButton>
</UiTooltip>`

const delayCode = `<UiTooltip content="Instant tooltip" :delay-duration="0">
  <UiButton variant="secondary">No delay</UiButton>
</UiTooltip>
<UiTooltip content="Default delay" :delay-duration="300">
  <UiButton variant="secondary">300ms (default)</UiButton>
</UiTooltip>
<UiTooltip content="Slow tooltip" :delay-duration="1000">
  <UiButton variant="secondary">1 second delay</UiButton>
</UiTooltip>`

const triggersCode = `<UiTooltip content="Settings">
  <UiButton variant="primary">
    <component :is="resolveIcon('settings')" class="size-4" />
  </UiButton>
</UiTooltip>
<UiTooltip content="More information available">
  <UiBadge variant="info">Hover for info</UiBadge>
</UiTooltip>
<UiTooltip content="Profile picture">
  <UiAvatar initials="JD" size="md" />
</UiTooltip>`

const propDefs: PropDef[] = [
  { name: 'content', type: 'string', default: 'Tooltip text' },
  {
    name: 'side',
    type: 'select',
    default: 'top',
    options: [
      { label: 'top', value: 'top' },
      { label: 'right', value: 'right' },
      { label: 'bottom', value: 'bottom' },
      { label: 'left', value: 'left' },
    ],
  },
  { name: 'delayDuration', type: 'number', default: 300 },
]

const apiProps: ApiPropRow[] = [
  { name: 'content', type: 'string', description: 'Tooltip text (required)' },
  {
    name: 'side',
    type: "'top' | 'right' | 'bottom' | 'left'",
    default: "'top'",
    description: 'Preferred tooltip placement',
  },
  {
    name: 'delayDuration',
    type: 'number',
    default: '300',
    description: 'Delay in ms before showing',
  },
]

const apiSlots: ApiSlotRow[] = [
  { name: 'default', description: 'Trigger element that activates the tooltip' },
]
</script>

<template>
  <div class="space-y-12">
    <header>
      <h1 class="mb-2 text-3xl font-bold">Tooltip</h1>
      <p class="text-muted-foreground text-lg">
        Small informational popup on hover or focus, anchored to a trigger element.
      </p>
    </header>

    <!-- Usage -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Usage</h2>
      <ComponentDemo :code="usageCode">
        <UiTooltip content="Hello from tooltip">
          <UiButton variant="secondary">Hover me</UiButton>
        </UiTooltip>
      </ComponentDemo>
    </section>

    <!-- Placement -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Placement</h2>
      <ComponentDemo :code="placementCode">
        <div class="flex flex-wrap items-center gap-4">
          <UiTooltip content="Tooltip on top" side="top">
            <UiButton variant="ghost">Top</UiButton>
          </UiTooltip>
          <UiTooltip content="Tooltip on right" side="right">
            <UiButton variant="ghost">Right</UiButton>
          </UiTooltip>
          <UiTooltip content="Tooltip on bottom" side="bottom">
            <UiButton variant="ghost">Bottom</UiButton>
          </UiTooltip>
          <UiTooltip content="Tooltip on left" side="left">
            <UiButton variant="ghost">Left</UiButton>
          </UiTooltip>
        </div>
      </ComponentDemo>
    </section>

    <!-- Custom Delay -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Custom Delay</h2>
      <ComponentDemo :code="delayCode">
        <div class="flex flex-wrap items-center gap-4">
          <UiTooltip content="Instant tooltip" :delay-duration="0">
            <UiButton variant="secondary">No delay</UiButton>
          </UiTooltip>
          <UiTooltip content="Default delay" :delay-duration="300">
            <UiButton variant="secondary">300ms (default)</UiButton>
          </UiTooltip>
          <UiTooltip content="Slow tooltip" :delay-duration="1000">
            <UiButton variant="secondary">1 second delay</UiButton>
          </UiTooltip>
        </div>
      </ComponentDemo>
    </section>

    <!-- With Various Triggers -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">With Various Triggers</h2>
      <ComponentDemo :code="triggersCode">
        <div class="flex flex-wrap items-center gap-4">
          <UiTooltip content="Settings">
            <UiButton variant="primary">
              <component :is="resolveIcon('settings')" class="size-4" />
            </UiButton>
          </UiTooltip>
          <UiTooltip content="More information available">
            <UiBadge variant="secondary">Hover for info</UiBadge>
          </UiTooltip>
          <UiTooltip content="Profile picture">
            <UiAvatar initials="JD" size="md" />
          </UiTooltip>
        </div>
      </ComponentDemo>
    </section>

    <!-- Playground -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Playground</h2>
      <ComponentPlayground :prop-defs="propDefs">
        <template #default="{ props: p }">
          <UiTooltip
            v-bind="p"
            :content="typeof p.content === 'string' ? p.content : 'Helpful context'"
          >
            <UiButton variant="secondary">Hover me</UiButton>
          </UiTooltip>
        </template>
      </ComponentPlayground>
    </section>

    <!-- Accessibility -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Accessibility</h2>
      <ComponentTestRunner>
        <div class="flex flex-wrap items-center gap-4">
          <UiTooltip content="Tooltip on a button">
            <UiButton variant="secondary">Hover me</UiButton>
          </UiTooltip>
          <UiTooltip content="Info tooltip">
            <UiBadge variant="secondary">Info</UiBadge>
          </UiTooltip>
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
