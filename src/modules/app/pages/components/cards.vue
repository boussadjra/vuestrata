<script setup lang="ts">
import ComponentApiTable from '@/components/docs/ComponentApiTable.vue'
import type { ApiPropRow, ApiSlotRow } from '@/components/docs/ComponentApiTable.vue'
import ComponentDemo from '@/components/docs/ComponentDemo.vue'
import ComponentPlayground from '@/components/docs/ComponentPlayground.vue'
import type { PropDef, SlotDef } from '@/components/docs/ComponentPlayground.vue'
import ComponentTestRunner from '@/components/docs/ComponentTestRunner.vue'

const propDefs: PropDef[] = [
  { name: 'title', type: 'string', default: 'Card Title' },
  { name: 'subtitle', type: 'string', default: '' },
  { name: 'padding', type: 'boolean', default: true },
  { name: 'hoverable', type: 'boolean', default: false },
]

const slotDefs: SlotDef[] = [{ name: 'default', default: 'Card body content goes here.' }]

const usageCode = `<UiCard title="Simple Card">
  <p class="text-sm text-surface-500">Card body content goes here.</p>
</UiCard>`

const subtitleCode = `<UiCard title="Project Alpha" subtitle="Started 2 weeks ago">
  <p class="text-sm text-surface-500">A brief overview of the project including objectives, timeline, and current progress.</p>
</UiCard>`

const footerCode = `<UiCard title="Team Update" subtitle="Engineering">
  <p class="text-sm text-surface-500">Sprint velocity improved by 15% this quarter. Keep up the great work!</p>
  <template #footer>
    <div class="flex gap-2">
      <UiButton size="sm" variant="primary">View Details</UiButton>
      <UiButton size="sm" variant="ghost">Dismiss</UiButton>
    </div>
  </template>
</UiCard>`

const hoverableCode = `<UiCard title="Design" hoverable>
  <p class="text-sm text-surface-500">UI/UX design system and Figma components.</p>
</UiCard>
<UiCard title="Development" hoverable>
  <p class="text-sm text-surface-500">Frontend and backend implementation.</p>
</UiCard>
<UiCard title="Testing" hoverable>
  <p class="text-sm text-surface-500">Unit, integration, and E2E test suites.</p>
</UiCard>`

const customHeaderCode = `<UiCard>
  <template #header>
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <UiAvatar size="sm" alt="Sarah K" />
        <div>
          <p class="text-sm font-medium">Sarah K.</p>
          <p class="text-xs text-surface-500">Product Manager</p>
        </div>
      </div>
      <UiBadge variant="success" dot size="sm">Active</UiBadge>
    </div>
  </template>
  <p class="text-sm text-surface-500">Working on the Q4 roadmap planning and feature prioritization.</p>
</UiCard>`

const noPaddingCode = `<UiCard title="Image Card" :padding="false">
  <div class="h-32 bg-gradient-to-br from-primary-400 to-accent-500 rounded-t-xl" />
  <div class="p-4">
    <p class="text-sm text-surface-500">Card with a full-bleed image header.</p>
  </div>
</UiCard>`

const apiProps: ApiPropRow[] = [
  { name: 'title', type: 'string', description: 'Card title' },
  { name: 'subtitle', type: 'string', description: 'Card subtitle' },
  { name: 'padding', type: 'boolean', default: 'true', description: 'Apply padding to body' },
  { name: 'hoverable', type: 'boolean', default: 'false', description: 'Hover elevation effect' },
]

const apiSlots: ApiSlotRow[] = [
  { name: 'default', description: 'Body content' },
  { name: 'header', description: 'Custom header (replaces title/subtitle)' },
  { name: 'footer', description: 'Footer content' },
]
</script>

<template>
  <div class="space-y-12">
    <header>
      <h1 class="mb-2 text-3xl font-bold">Card</h1>
      <p class="text-surface-500 dark:text-surface-400 text-lg">
        Content container with optional header, footer, title, subtitle, and hover effect.
      </p>
    </header>

    <!-- Usage -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Usage</h2>
      <ComponentDemo :code="usageCode">
        <div class="max-w-sm">
          <UiCard title="Simple Card">
            <p class="text-surface-500 text-sm">Card body content goes here.</p>
          </UiCard>
        </div>
      </ComponentDemo>
    </section>

    <!-- With Subtitle -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">With Subtitle</h2>
      <ComponentDemo :code="subtitleCode">
        <div class="max-w-sm">
          <UiCard title="Project Alpha" subtitle="Started 2 weeks ago">
            <p class="text-surface-500 text-sm">
              A brief overview of the project including objectives, timeline, and current progress.
            </p>
          </UiCard>
        </div>
      </ComponentDemo>
    </section>

    <!-- With Footer -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">With Footer</h2>
      <ComponentDemo :code="footerCode">
        <div class="max-w-sm">
          <UiCard title="Team Update" subtitle="Engineering">
            <p class="text-surface-500 text-sm">
              Sprint velocity improved by 15% this quarter. Keep up the great work!
            </p>
            <template #footer>
              <div class="flex gap-2">
                <UiButton size="sm" variant="primary">View Details</UiButton>
                <UiButton size="sm" variant="ghost">Dismiss</UiButton>
              </div>
            </template>
          </UiCard>
        </div>
      </ComponentDemo>
    </section>

    <!-- Hoverable -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Hoverable</h2>
      <p class="text-surface-500 text-sm">
        Use the
        <code class="bg-surface-100 dark:bg-surface-800 rounded px-1.5 py-0.5 text-xs"
          >hoverable</code
        >
        prop for interactive cards.
      </p>
      <ComponentDemo :code="hoverableCode">
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <UiCard title="Design" hoverable>
            <p class="text-surface-500 text-sm">UI/UX design system and Figma components.</p>
          </UiCard>
          <UiCard title="Development" hoverable>
            <p class="text-surface-500 text-sm">Frontend and backend implementation.</p>
          </UiCard>
          <UiCard title="Testing" hoverable>
            <p class="text-surface-500 text-sm">Unit, integration, and E2E test suites.</p>
          </UiCard>
        </div>
      </ComponentDemo>
    </section>

    <!-- Custom Header -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Custom Header Slot</h2>
      <ComponentDemo :code="customHeaderCode">
        <div class="max-w-sm">
          <UiCard>
            <template #header>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <UiAvatar size="sm" alt="Sarah K" />
                  <div>
                    <p class="text-sm font-medium">Sarah K.</p>
                    <p class="text-surface-500 text-xs">Product Manager</p>
                  </div>
                </div>
                <UiBadge variant="success" dot size="sm">Active</UiBadge>
              </div>
            </template>
            <p class="text-surface-500 text-sm">
              Working on the Q4 roadmap planning and feature prioritization.
            </p>
          </UiCard>
        </div>
      </ComponentDemo>
    </section>

    <!-- No Padding -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">No Padding</h2>
      <p class="text-surface-500 text-sm">
        Set
        <code class="bg-surface-100 dark:bg-surface-800 rounded px-1.5 py-0.5 text-xs"
          >:padding="false"</code
        >
        for edge-to-edge content.
      </p>
      <ComponentDemo :code="noPaddingCode">
        <div class="max-w-sm">
          <UiCard title="Image Card" :padding="false">
            <div class="from-primary-400 to-accent-500 h-32 rounded-t-xl bg-gradient-to-br" />
            <div class="p-4">
              <p class="text-surface-500 text-sm">Card with a full-bleed image header.</p>
            </div>
          </UiCard>
        </div>
      </ComponentDemo>
    </section>

    <!-- Playground -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Playground</h2>
      <ComponentPlayground :prop-defs="propDefs" :slot-defs="slotDefs">
        <template #default="{ props: p, slots: s }">
          <UiCard v-bind="p">{{ s.default }}</UiCard>
        </template>
      </ComponentPlayground>
    </section>

    <!-- Accessibility Audit -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Accessibility</h2>
      <ComponentTestRunner>
        <div class="grid max-w-lg grid-cols-1 gap-4 sm:grid-cols-2">
          <UiCard title="Simple Card">
            <p class="text-surface-500 text-sm">Card body content.</p>
          </UiCard>
          <UiCard title="Hoverable" hoverable>
            <p class="text-surface-500 text-sm">Interactive card.</p>
          </UiCard>
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
