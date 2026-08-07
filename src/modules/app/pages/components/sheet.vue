<script setup lang="ts">
import ComponentApiTable from '@/components/docs/ComponentApiTable.vue'
import type { ApiPropRow, ApiSlotRow } from '@/components/docs/ComponentApiTable.vue'
import ComponentDemo from '@/components/docs/ComponentDemo.vue'
import ComponentPlayground from '@/components/docs/ComponentPlayground.vue'
import type { PropDef } from '@/components/docs/ComponentPlayground.vue'
import ComponentTestRunner from '@/components/docs/ComponentTestRunner.vue'

const basicOpen = ref(false)
const leftOpen = ref(false)
const rightOpen = ref(false)
const topOpen = ref(false)
const bottomOpen = ref(false)
const formOpen = ref(false)
const playgroundOpen = ref(false)

const propDefs: PropDef[] = [
  {
    name: 'side',
    type: 'select',
    default: 'right',
    options: [
      { label: 'left', value: 'left' },
      { label: 'right', value: 'right' },
      { label: 'top', value: 'top' },
      { label: 'bottom', value: 'bottom' },
    ],
  },
  { name: 'title', type: 'string', default: 'Sheet Title' },
  { name: 'description', type: 'string', default: 'Sheet description text.' },
]

const usageCode = `<UiSheet v-model="open" title="Sheet Title" description="A basic sheet panel.">
  <template #trigger>
    <UiButton>Open Sheet</UiButton>
  </template>
  <p class="text-sm text-muted-foreground">This is the sheet body content.</p>
</UiSheet>`

const sidesCode = `<UiSheet v-model="leftOpen" side="left" title="Left Sheet" description="Slides in from the left.">
  <template #trigger><UiButton variant="secondary">Left</UiButton></template>
  <p class="text-sm">Content from the left side.</p>
</UiSheet>

<UiSheet v-model="rightOpen" side="right" title="Right Sheet" description="Slides in from the right.">
  <template #trigger><UiButton variant="secondary">Right</UiButton></template>
  <p class="text-sm">Content from the right side.</p>
</UiSheet>

<UiSheet v-model="topOpen" side="top" title="Top Sheet" description="Slides in from the top.">
  <template #trigger><UiButton variant="secondary">Top</UiButton></template>
  <p class="text-sm">Content from the top.</p>
</UiSheet>

<UiSheet v-model="bottomOpen" side="bottom" title="Bottom Sheet" description="Slides in from the bottom.">
  <template #trigger><UiButton variant="secondary">Bottom</UiButton></template>
  <p class="text-sm">Content from the bottom.</p>
</UiSheet>`

const formCode = `<UiSheet v-model="formOpen" side="right" title="Edit Profile" description="Update your profile information.">
  <template #trigger>
    <UiButton>Edit Profile</UiButton>
  </template>
  <div class="space-y-4">
    <UiTextField label="Name" placeholder="Your name" />
    <UiTextField label="Email" type="email" placeholder="you@example.com" />
    <UiTextarea label="Bio" placeholder="Tell us about yourself" :rows="3" />
    <div class="flex justify-end gap-2 pt-4">
      <UiButton variant="ghost" @click="formOpen = false">Cancel</UiButton>
      <UiButton @click="formOpen = false">Save</UiButton>
    </div>
  </div>
</UiSheet>`

const apiProps: ApiPropRow[] = [
  {
    name: 'modelValue',
    type: 'boolean',
    default: 'false',
    description: 'Controls open/close state',
  },
  {
    name: 'side',
    type: "'left' | 'right' | 'top' | 'bottom'",
    default: "'right'",
    description: 'Slide-in direction',
  },
  { name: 'title', type: 'string', description: 'Sheet header title' },
  { name: 'description', type: 'string', description: 'Sheet header description' },
]

const apiSlots: ApiSlotRow[] = [
  { name: 'trigger', description: 'Element that triggers the sheet open' },
  { name: 'default', description: 'Sheet body content' },
]
</script>

<template>
  <div class="space-y-12">
    <header>
      <h1 class="mb-2 text-3xl font-bold">Sheet</h1>
      <p class="text-muted-foreground text-lg">
        A panel that slides in from the edge of the screen, useful for secondary content and forms.
      </p>
    </header>

    <!-- Usage -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Usage</h2>
      <ComponentDemo :code="usageCode">
        <UiSheet v-model="basicOpen" title="Sheet Title" description="A basic sheet panel.">
          <template #trigger>
            <UiButton>Open Sheet</UiButton>
          </template>
          <p class="text-muted-foreground text-sm">
            This is the sheet body content. You can place anything here.
          </p>
        </UiSheet>
      </ComponentDemo>
    </section>

    <!-- Sides -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Sides</h2>
      <ComponentDemo :code="sidesCode">
        <div class="flex flex-wrap gap-3">
          <UiSheet
            v-model="leftOpen"
            side="left"
            title="Left Sheet"
            description="Slides in from the left."
          >
            <template #trigger>
              <UiButton variant="secondary">Left</UiButton>
            </template>
            <p class="text-sm">Content from the left side.</p>
          </UiSheet>

          <UiSheet
            v-model="rightOpen"
            side="right"
            title="Right Sheet"
            description="Slides in from the right."
          >
            <template #trigger>
              <UiButton variant="secondary">Right</UiButton>
            </template>
            <p class="text-sm">Content from the right side.</p>
          </UiSheet>

          <UiSheet
            v-model="topOpen"
            side="top"
            title="Top Sheet"
            description="Slides in from the top."
          >
            <template #trigger>
              <UiButton variant="secondary">Top</UiButton>
            </template>
            <p class="text-sm">Content from the top.</p>
          </UiSheet>

          <UiSheet
            v-model="bottomOpen"
            side="bottom"
            title="Bottom Sheet"
            description="Slides in from the bottom."
          >
            <template #trigger>
              <UiButton variant="secondary">Bottom</UiButton>
            </template>
            <p class="text-sm">Content from the bottom.</p>
          </UiSheet>
        </div>
      </ComponentDemo>
    </section>

    <!-- With Form -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">With Form Content</h2>
      <ComponentDemo :code="formCode">
        <UiSheet
          v-model="formOpen"
          side="right"
          title="Edit Profile"
          description="Update your profile information."
        >
          <template #trigger>
            <UiButton>Edit Profile</UiButton>
          </template>
          <div class="space-y-4">
            <UiTextField label="Name" placeholder="Your name" />
            <UiTextField label="Email" type="email" placeholder="you@example.com" />
            <UiTextarea label="Bio" placeholder="Tell us about yourself" :rows="3" />
            <div class="flex justify-end gap-2 pt-4">
              <UiButton variant="ghost" @click="formOpen = false">Cancel</UiButton>
              <UiButton @click="formOpen = false">Save</UiButton>
            </div>
          </div>
        </UiSheet>
      </ComponentDemo>
    </section>

    <!-- Playground -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Playground</h2>
      <ComponentPlayground :prop-defs="propDefs">
        <template #default="{ props: p }">
          <UiSheet v-model="playgroundOpen" v-bind="p">
            <template #trigger>
              <UiButton>Open Sheet</UiButton>
            </template>
            <p class="text-muted-foreground text-sm">Sheet content goes here.</p>
          </UiSheet>
        </template>
      </ComponentPlayground>
    </section>

    <!-- Accessibility -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Accessibility</h2>
      <ComponentTestRunner>
        <UiSheet v-model="basicOpen" title="Sheet Title" description="A basic sheet panel.">
          <template #trigger>
            <UiButton>Open Sheet</UiButton>
          </template>
          <p class="text-sm">Sheet content.</p>
        </UiSheet>
        <UiSheet v-model="leftOpen" side="left" title="Left Sheet">
          <template #trigger>
            <UiButton variant="secondary">Left</UiButton>
          </template>
          <p class="text-sm">Left content.</p>
        </UiSheet>
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
