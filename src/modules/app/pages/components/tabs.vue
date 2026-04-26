<script setup lang="ts">
import ComponentApiTable from '@/components/docs/ComponentApiTable.vue'
import type { ApiPropRow, ApiEventRow, ApiSlotRow } from '@/components/docs/ComponentApiTable.vue'
import ComponentDemo from '@/components/docs/ComponentDemo.vue'
import ComponentTestRunner from '@/components/docs/ComponentTestRunner.vue'

const activeTab = ref('overview')

const basicTabs = [
  { value: 'overview', label: 'Overview' },
  { value: 'api', label: 'API' },
  { value: 'examples', label: 'Examples' },
]

const iconTabs = [
  { value: 'profile', label: 'Profile' },
  { value: 'settings', label: 'Settings' },
  { value: 'notifications', label: 'Notifications' },
]

const withDisabled = [
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'archived', label: 'Archived', disabled: true },
]

const usageCode = `<UiTabs :tabs="basicTabs">
  <template #overview>
    <p>Overview content for this component.</p>
  </template>
  <template #api>
    <p>API documentation and props reference.</p>
  </template>
  <template #examples>
    <p>Interactive code examples and usage patterns.</p>
  </template>
</UiTabs>`

const controlledCode = `<UiTabs v-model="activeTab" :tabs="basicTabs">
  <template #overview><p>Overview panel</p></template>
  <template #api><p>API panel</p></template>
  <template #examples><p>Examples panel</p></template>
</UiTabs>
<UiButton size="sm" variant="ghost" @click="activeTab = 'overview'">Go to Overview</UiButton>
<UiButton size="sm" variant="ghost" @click="activeTab = 'api'">Go to API</UiButton>`

const richContentCode = `<UiTabs :tabs="iconTabs">
  <template #profile>
    <UiAvatar size="lg" alt="Jane Doe" />
    <p class="font-medium">Jane Doe</p>
  </template>
  <template #settings>
    <UiSwitch :model-value="true" label="Email notifications" />
    <UiSwitch :model-value="false" label="Push notifications" />
  </template>
  <template #notifications>
    <UiAlert variant="info" title="New feature">Dark mode is now available.</UiAlert>
  </template>
</UiTabs>`

const disabledCode = `<UiTabs :tabs="withDisabled">
  <template #active><p>Active items view.</p></template>
  <template #draft><p>Draft items view.</p></template>
  <template #archived><p>Archived items (disabled).</p></template>
</UiTabs>`

const apiProps: ApiPropRow[] = [
  {
    name: 'tabs',
    type: '{ value, label, disabled? }[]',
    default: '[]',
    description: 'Tab definitions',
  },
  { name: 'modelValue', type: 'string', description: 'Active tab value (v-model)' },
  { name: 'defaultValue', type: 'string', description: 'Initially active tab (uncontrolled)' },
]

const apiEvents: ApiEventRow[] = [
  { name: 'update:modelValue', payload: 'string', description: 'Emitted when active tab changes' },
]

const apiSlots: ApiSlotRow[] = [
  { name: 'default', description: 'Fallback content for all tabs' },
  { name: '[tab.value]', description: 'Content for a specific tab panel' },
]
</script>

<template>
  <div class="space-y-12">
    <header>
      <h1 class="mb-2 text-3xl font-bold">Tabs</h1>
      <p class="text-surface-500 dark:text-surface-400 text-lg">
        Organize content into switchable panels with accessible tab navigation.
      </p>
    </header>

    <!-- Usage -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Usage</h2>
      <ComponentDemo :code="usageCode">
        <div class="max-w-lg">
          <UiTabs :tabs="basicTabs">
            <template #overview>
              <p class="text-surface-500 py-4 text-sm">
                Overview content for this component. Describe what it does and when to use it.
              </p>
            </template>
            <template #api>
              <p class="text-surface-500 py-4 text-sm">
                API documentation and props reference table would go here.
              </p>
            </template>
            <template #examples>
              <p class="text-surface-500 py-4 text-sm">
                Interactive code examples and usage patterns.
              </p>
            </template>
          </UiTabs>
        </div>
      </ComponentDemo>
    </section>

    <!-- Controlled -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Controlled (v-model)</h2>
      <p class="text-surface-500 text-sm">
        Use
        <code class="bg-surface-100 dark:bg-surface-800 rounded px-1.5 py-0.5 text-xs"
          >v-model</code
        >
        to control the active tab programmatically.
      </p>
      <ComponentDemo :code="controlledCode">
        <div class="max-w-lg space-y-3">
          <UiTabs v-model="activeTab" :tabs="basicTabs">
            <template #overview
              ><p class="text-surface-500 py-4 text-sm">Overview panel</p></template
            >
            <template #api><p class="text-surface-500 py-4 text-sm">API panel</p></template>
            <template #examples
              ><p class="text-surface-500 py-4 text-sm">Examples panel</p></template
            >
          </UiTabs>
          <div class="flex gap-2">
            <UiButton size="sm" variant="ghost" @click="activeTab = 'overview'"
              >Go to Overview</UiButton
            >
            <UiButton size="sm" variant="ghost" @click="activeTab = 'api'">Go to API</UiButton>
          </div>
          <p class="text-surface-500 text-xs">
            Active tab: <span class="font-medium">{{ activeTab }}</span>
          </p>
        </div>
      </ComponentDemo>
    </section>

    <!-- Rich Content -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Rich Content</h2>
      <ComponentDemo :code="richContentCode">
        <div class="max-w-lg">
          <UiTabs :tabs="iconTabs">
            <template #profile>
              <div class="flex items-center gap-3 py-4">
                <UiAvatar size="lg" alt="Jane Doe" />
                <div>
                  <p class="font-medium">Jane Doe</p>
                  <p class="text-surface-500 text-sm">Product Designer</p>
                </div>
              </div>
            </template>
            <template #settings>
              <div class="space-y-3 py-4">
                <UiSwitch :model-value="true" label="Email notifications" id="tab-notif" />
                <UiSwitch :model-value="false" label="Push notifications" id="tab-push" />
              </div>
            </template>
            <template #notifications>
              <div class="space-y-2 py-4">
                <UiAlert variant="info" title="New feature">Dark mode is now available.</UiAlert>
                <UiAlert variant="success" title="Saved">Your settings have been updated.</UiAlert>
              </div>
            </template>
          </UiTabs>
        </div>
      </ComponentDemo>
    </section>

    <!-- Disabled Tab -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Disabled Tabs</h2>
      <ComponentDemo :code="disabledCode">
        <div class="max-w-lg">
          <UiTabs :tabs="withDisabled">
            <template #active
              ><p class="text-surface-500 py-4 text-sm">Active items view.</p></template
            >
            <template #draft
              ><p class="text-surface-500 py-4 text-sm">Draft items view.</p></template
            >
            <template #archived
              ><p class="text-surface-500 py-4 text-sm">Archived items (disabled).</p></template
            >
          </UiTabs>
        </div>
      </ComponentDemo>
    </section>

    <!-- Accessibility -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Accessibility</h2>
      <ComponentTestRunner>
        <div class="max-w-lg">
          <UiTabs :tabs="basicTabs">
            <template #overview
              ><p class="text-surface-500 py-4 text-sm">Overview panel</p></template
            >
            <template #api><p class="text-surface-500 py-4 text-sm">API panel</p></template>
            <template #examples
              ><p class="text-surface-500 py-4 text-sm">Examples panel</p></template
            >
          </UiTabs>
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
