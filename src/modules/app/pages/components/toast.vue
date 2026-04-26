<script setup lang="ts">
import ComponentApiTable from '@/components/docs/ComponentApiTable.vue'
import type { ApiPropRow, ApiEventRow } from '@/components/docs/ComponentApiTable.vue'
import ComponentDemo from '@/components/docs/ComponentDemo.vue'
import ComponentPlayground from '@/components/docs/ComponentPlayground.vue'
import type { PropDef } from '@/components/docs/ComponentPlayground.vue'
import ComponentTestRunner from '@/components/docs/ComponentTestRunner.vue'

const usageCode = `<UiToast variant="info" title="Heads up" message="This is an info toast." trigger-label="Show Toast" />`

const variantsCode = `<UiToast variant="info" title="Info" message="This is an informational notification." trigger-label="Info Toast" />
<UiToast variant="success" title="Saved" message="Changes saved successfully." trigger-label="Success Toast" />
<UiToast variant="warning" title="Warning" message="Some fields need attention." trigger-label="Warning Toast" />
<UiToast variant="error" title="Failed" message="Request failed. Please try again." trigger-label="Error Toast" />`

const customCode = `<UiToast variant="success" title="Upload Complete" message="Your file has been uploaded and processed." trigger-label="Upload Done" />
<UiToast variant="error" title="Connection Lost" message="Unable to reach the server. Check your network." trigger-label="Connection Error" />
<UiToast variant="info" title="New Version" message="A new version is available. Refresh to update." trigger-label="Update Available" />`

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
  { name: 'title', type: 'string', default: 'Notification' },
  { name: 'message', type: 'string', default: 'This is a toast message.' },
  { name: 'triggerLabel', type: 'string', default: 'Show Toast' },
  { name: 'duration', type: 'number', default: 5000 },
]

const apiProps: ApiPropRow[] = [
  {
    name: 'variant',
    type: "'info' | 'success' | 'warning' | 'error'",
    default: "'info'",
    description: 'Toast color variant',
  },
  { name: 'title', type: 'string', description: 'Toast title' },
  { name: 'message', type: 'string', description: 'Toast message body' },
  { name: 'triggerLabel', type: 'string', description: 'Label for the trigger button' },
  { name: 'duration', type: 'number', default: '5000', description: 'Auto-dismiss duration in ms' },
]

const apiEvents: ApiEventRow[] = [
  { name: 'close', payload: '—', description: 'Emitted when the toast is dismissed' },
]
</script>

<template>
  <div class="space-y-12">
    <header>
      <h1 class="mb-2 text-3xl font-bold">Toast</h1>
      <p class="text-surface-500 dark:text-surface-400 text-lg">
        Temporary notification popups with variants and auto-dismiss.
      </p>
    </header>

    <!-- Usage -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Usage</h2>
      <ComponentDemo :code="usageCode">
        <UiToast
          variant="info"
          title="Heads up"
          message="This is an info toast."
          trigger-label="Show Toast"
        />
      </ComponentDemo>
    </section>

    <!-- Variants -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Variants</h2>
      <ComponentDemo :code="variantsCode">
        <div class="flex flex-wrap gap-3">
          <UiToast
            variant="info"
            title="Info"
            message="This is an informational notification."
            trigger-label="Info Toast"
          />
          <UiToast
            variant="success"
            title="Saved"
            message="Changes saved successfully."
            trigger-label="Success Toast"
          />
          <UiToast
            variant="warning"
            title="Warning"
            message="Some fields need attention."
            trigger-label="Warning Toast"
          />
          <UiToast
            variant="error"
            title="Failed"
            message="Request failed. Please try again."
            trigger-label="Error Toast"
          />
        </div>
      </ComponentDemo>
    </section>

    <!-- Custom Messages -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Custom Messages</h2>
      <ComponentDemo :code="customCode">
        <div class="flex flex-wrap gap-3">
          <UiToast
            variant="success"
            title="Upload Complete"
            message="Your file has been uploaded and processed."
            trigger-label="Upload Done"
          />
          <UiToast
            variant="error"
            title="Connection Lost"
            message="Unable to reach the server. Check your network."
            trigger-label="Connection Error"
          />
          <UiToast
            variant="info"
            title="New Version"
            message="A new version is available. Refresh to update."
            trigger-label="Update Available"
          />
        </div>
      </ComponentDemo>
    </section>

    <!-- Playground -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Playground</h2>
      <ComponentPlayground :prop-defs="propDefs">
        <template #default="{ props: p }">
          <UiToast v-bind="p" />
        </template>
      </ComponentPlayground>
    </section>

    <!-- Accessibility -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Accessibility</h2>
      <ComponentTestRunner>
        <div class="flex flex-wrap gap-3">
          <UiToast
            variant="info"
            title="Info"
            message="Informational notification."
            trigger-label="Info"
          />
          <UiToast
            variant="success"
            title="Success"
            message="Operation succeeded."
            trigger-label="Success"
          />
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
