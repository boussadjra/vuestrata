<script setup lang="ts">
import ComponentApiTable from '@/components/docs/ComponentApiTable.vue'
import type { ApiPropRow, ApiEventRow, ApiSlotRow } from '@/components/docs/ComponentApiTable.vue'
import ComponentDemo from '@/components/docs/ComponentDemo.vue'
import ComponentPlayground from '@/components/docs/ComponentPlayground.vue'
import type { PropDef, SlotDef } from '@/components/docs/ComponentPlayground.vue'
import ComponentTestRunner from '@/components/docs/ComponentTestRunner.vue'

const usageCode = `<UiAlert variant="info" title="Heads up">This is an informational alert with a title and body text.</UiAlert>`

const variantsCode = `<UiAlert variant="info" title="Info">This is an informational alert.</UiAlert>
<UiAlert variant="success" title="Success">Operation completed successfully.</UiAlert>
<UiAlert variant="warning" title="Warning">Be careful with this action.</UiAlert>
<UiAlert variant="error" title="Error">Something went wrong. Please try again.</UiAlert>`

const dismissibleCode = `<UiAlert variant="warning" title="Dismissible Warning" dismissible>This alert can be dismissed by clicking the close button.</UiAlert>
<UiAlert variant="info" title="Dismissible Info" dismissible>Click the X to close this alert.</UiAlert>`

const noTitleCode = `<UiAlert variant="info">A simple info message without a title.</UiAlert>
<UiAlert variant="error">An error occurred while processing your request.</UiAlert>`

const noIconCode = `<UiAlert variant="success" title="Success" :icon="false">Alert without icon for a cleaner look.</UiAlert>`

const richCode = `<UiAlert variant="warning" title="Action Required">
  <p>Your subscription will expire in <strong>3 days</strong>.</p>
  <div class="mt-3 flex gap-2">
    <UiButton size="sm" variant="primary">Renew Now</UiButton>
    <UiButton size="sm" variant="ghost">Remind Later</UiButton>
  </div>
</UiAlert>`

const propDefs: PropDef[] = [
  {
    name: 'variant',
    type: 'select',
    default: 'info',
    options: [
      { label: 'info', value: 'info' },
      { label: 'success', value: 'success' },
      { label: 'warning', value: 'warning' },
      { label: 'error', value: 'error' },
    ],
  },
  { name: 'title', type: 'string', default: 'Alert Title' },
  { name: 'dismissible', type: 'boolean', default: false },
  { name: 'icon', type: 'boolean', default: true },
]

const slotDefs: SlotDef[] = [{ name: 'default', default: 'This is an alert message.' }]

const apiProps: ApiPropRow[] = [
  {
    name: 'variant',
    type: "'info' | 'success' | 'warning' | 'error'",
    default: "'info'",
    description: 'Alert color variant',
  },
  { name: 'title', type: 'string', description: 'Alert title' },
  { name: 'dismissible', type: 'boolean', default: 'false', description: 'Show close button' },
  { name: 'icon', type: 'boolean', default: 'true', description: 'Show variant icon' },
]

const apiEvents: ApiEventRow[] = [
  { name: 'dismiss', payload: '—', description: 'Emitted when the close button is clicked' },
]

const apiSlots: ApiSlotRow[] = [{ name: 'default', description: 'Alert body content' }]
</script>

<template>
  <div class="space-y-12">
    <header>
      <h1 class="mb-2 text-3xl font-bold">Alert</h1>
      <p class="text-muted-foreground text-lg">
        Contextual feedback messages with variant colors, icons, and optional dismiss.
      </p>
    </header>

    <!-- Usage -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Usage</h2>
      <ComponentDemo :code="usageCode">
        <div class="max-w-lg">
          <UiAlert variant="info" title="Heads up"
            >This is an informational alert with a title and body text.</UiAlert
          >
        </div>
      </ComponentDemo>
    </section>

    <!-- Variants -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Variants</h2>
      <ComponentDemo :code="variantsCode">
        <div class="max-w-lg space-y-3">
          <UiAlert variant="info" title="Info">This is an informational alert.</UiAlert>
          <UiAlert variant="success" title="Success">Operation completed successfully.</UiAlert>
          <UiAlert variant="warning" title="Warning">Be careful with this action.</UiAlert>
          <UiAlert variant="error" title="Error">Something went wrong. Please try again.</UiAlert>
        </div>
      </ComponentDemo>
    </section>

    <!-- Dismissible -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Dismissible</h2>
      <p class="text-surface-500 text-sm">
        Add a close button with the
        <code class="bg-surface-100 dark:bg-surface-800 rounded px-1.5 py-0.5 text-xs"
          >dismissible</code
        >
        prop.
      </p>
      <ComponentDemo :code="dismissibleCode">
        <div class="max-w-lg space-y-3">
          <UiAlert variant="warning" title="Dismissible Warning" dismissible
            >This alert can be dismissed by clicking the close button.</UiAlert
          >
          <UiAlert variant="info" title="Dismissible Info" dismissible
            >Click the X to close this alert.</UiAlert
          >
        </div>
      </ComponentDemo>
    </section>

    <!-- Without Title -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Without Title</h2>
      <ComponentDemo :code="noTitleCode">
        <div class="max-w-lg space-y-3">
          <UiAlert variant="info">A simple info message without a title.</UiAlert>
          <UiAlert variant="error">An error occurred while processing your request.</UiAlert>
        </div>
      </ComponentDemo>
    </section>

    <!-- Without Icon -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Without Icon</h2>
      <ComponentDemo :code="noIconCode">
        <div class="max-w-lg">
          <UiAlert variant="success" title="Success" :icon="false"
            >Alert without icon for a cleaner look.</UiAlert
          >
        </div>
      </ComponentDemo>
    </section>

    <!-- Rich Content -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Rich Body Content</h2>
      <ComponentDemo :code="richCode">
        <div class="max-w-lg">
          <UiAlert variant="warning" title="Action Required">
            <p>
              Your subscription will expire in <strong>3 days</strong>. Please renew to keep access
              to premium features.
            </p>
            <div class="mt-3 flex gap-2">
              <UiButton size="sm" variant="primary">Renew Now</UiButton>
              <UiButton size="sm" variant="ghost">Remind Later</UiButton>
            </div>
          </UiAlert>
        </div>
      </ComponentDemo>
    </section>

    <!-- Playground -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Playground</h2>
      <ComponentPlayground :prop-defs="propDefs" :slot-defs="slotDefs">
        <template #default="{ props: p, slots: s }">
          <div class="max-w-lg">
            <UiAlert v-bind="p">{{ s.default }}</UiAlert>
          </div>
        </template>
      </ComponentPlayground>
    </section>

    <!-- Accessibility -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Accessibility</h2>
      <ComponentTestRunner>
        <div class="max-w-lg space-y-3">
          <UiAlert variant="info" title="Info">Informational alert.</UiAlert>
          <UiAlert variant="error" title="Error" dismissible>Dismissible error alert.</UiAlert>
          <UiAlert variant="success">Alert without title.</UiAlert>
        </div>
      </ComponentTestRunner>
    </section>

    <!-- API Reference -->
    <ComponentApiTable :props="apiProps" :events="apiEvents" :slots="apiSlots" />
  </div>
</template>

<route lang="yaml">
meta:
  layout: components
</route>
