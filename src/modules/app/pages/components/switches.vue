<script setup lang="ts">
import ComponentApiTable from '@/components/docs/ComponentApiTable.vue'
import type { ApiPropRow, ApiEventRow } from '@/components/docs/ComponentApiTable.vue'
import ComponentDemo from '@/components/docs/ComponentDemo.vue'
import ComponentPlayground from '@/components/docs/ComponentPlayground.vue'
import type { PropDef } from '@/components/docs/ComponentPlayground.vue'
import ComponentTestRunner from '@/components/docs/ComponentTestRunner.vue'

const basic = ref(true)
const darkMode = ref(false)
const notifications = ref(true)
const autoSave = ref(false)
const playgroundValue = ref(false)

const propDefs: PropDef[] = [
  { name: 'label', type: 'string', default: 'Toggle me' },
  { name: 'disabled', type: 'boolean', default: false },
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

const usageCode = `<UiSwitch v-model="enabled" label="Enable feature" />`

const statesCode = `<UiSwitch :model-value="true" label="On" />
<UiSwitch :model-value="false" label="Off" />
<UiSwitch :model-value="true" label="Disabled (on)" disabled />
<UiSwitch :model-value="false" label="Disabled (off)" disabled />`

const sizesCode = `<UiSwitch :model-value="true" label="Small" size="sm" />
<UiSwitch :model-value="true" label="Medium (default)" size="md" />
<UiSwitch :model-value="true" label="Large" size="lg" />`

const settingsCode = `<div class="divide-y max-w-md">
  <div class="flex items-center justify-between p-4">
    <div>
      <p class="text-sm font-medium">Dark mode</p>
      <p class="text-xs text-surface-500">Use dark theme across the app</p>
    </div>
    <UiSwitch v-model="darkMode" />
  </div>
  <div class="flex items-center justify-between p-4">
    <div>
      <p class="text-sm font-medium">Notifications</p>
      <p class="text-xs text-surface-500">Receive push notifications</p>
    </div>
    <UiSwitch v-model="notifications" />
  </div>
</div>`

const apiProps: ApiPropRow[] = [
  { name: 'modelValue', type: 'boolean', default: 'false', description: 'Toggle state (v-model)' },
  { name: 'label', type: 'string', description: 'Switch label' },
  { name: 'disabled', type: 'boolean', default: 'false', description: 'Disables the switch' },
  { name: 'size', type: "'sm' | 'md' | 'lg'", default: "'md'", description: 'Switch size' },
  { name: 'id', type: 'string', description: 'HTML id attribute' },
]

const apiEvents: ApiEventRow[] = [
  { name: 'update:modelValue', payload: 'boolean', description: 'Emitted when toggled' },
]
</script>

<template>
  <div class="space-y-12">
    <header>
      <h1 class="mb-2 text-3xl font-bold">Switch</h1>
      <p class="text-muted-foreground text-lg">Toggle control for boolean on/off settings.</p>
    </header>

    <!-- Usage -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Usage</h2>
      <ComponentDemo :code="usageCode">
        <UiSwitch v-model="basic" label="Enable feature" id="basic-switch" />
      </ComponentDemo>
    </section>

    <!-- States -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">States</h2>
      <ComponentDemo :code="statesCode">
        <div class="space-y-4">
          <UiSwitch :model-value="true" label="On" id="state-on" />
          <UiSwitch :model-value="false" label="Off" id="state-off" />
          <UiSwitch :model-value="true" label="Disabled (on)" id="state-disabled-on" disabled />
          <UiSwitch :model-value="false" label="Disabled (off)" id="state-disabled-off" disabled />
        </div>
      </ComponentDemo>
    </section>

    <!-- Sizes -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Sizes</h2>
      <ComponentDemo :code="sizesCode">
        <div class="space-y-4">
          <UiSwitch :model-value="true" label="Small" id="size-sm" size="sm" />
          <UiSwitch :model-value="true" label="Medium (default)" id="size-md" size="md" />
          <UiSwitch :model-value="true" label="Large" id="size-lg" size="lg" />
        </div>
      </ComponentDemo>
    </section>

    <!-- Settings Example -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Settings Panel</h2>
      <p class="text-surface-500 text-sm">Common pattern: a list of toggleable settings.</p>
      <ComponentDemo :code="settingsCode">
        <div
          class="border-surface-200 dark:border-surface-700/60 dark:bg-surface-900 divide-surface-200 dark:divide-surface-700/60 max-w-md divide-y rounded-xl border bg-white"
        >
          <div class="flex items-center justify-between p-4">
            <div>
              <p class="text-foreground text-sm font-medium">Dark mode</p>
              <p class="text-surface-500 text-xs">Use dark theme across the app</p>
            </div>
            <UiSwitch v-model="darkMode" id="setting-dark" />
          </div>
          <div class="flex items-center justify-between p-4">
            <div>
              <p class="text-foreground text-sm font-medium">Notifications</p>
              <p class="text-surface-500 text-xs">Receive push notifications</p>
            </div>
            <UiSwitch v-model="notifications" id="setting-notifs" />
          </div>
          <div class="flex items-center justify-between p-4">
            <div>
              <p class="text-foreground text-sm font-medium">Auto-save</p>
              <p class="text-surface-500 text-xs">Save changes automatically</p>
            </div>
            <UiSwitch v-model="autoSave" id="setting-autosave" />
          </div>
        </div>
      </ComponentDemo>
    </section>

    <!-- Playground -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Playground</h2>
      <ComponentPlayground :prop-defs="propDefs">
        <template #default="{ props: p }">
          <UiSwitch v-bind="p" v-model="playgroundValue" />
        </template>
      </ComponentPlayground>
    </section>

    <!-- Accessibility Audit -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Accessibility</h2>
      <ComponentTestRunner>
        <div class="space-y-4">
          <UiSwitch :model-value="true" label="Enabled" id="a11y-on" />
          <UiSwitch :model-value="false" label="Disabled state" id="a11y-off" />
          <UiSwitch :model-value="false" label="Disabled switch" id="a11y-disabled" disabled />
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
