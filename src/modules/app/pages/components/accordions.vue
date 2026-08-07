<script setup lang="ts">
import ComponentApiTable from '@/components/docs/ComponentApiTable.vue'
import type { ApiPropRow, ApiSlotRow } from '@/components/docs/ComponentApiTable.vue'
import ComponentDemo from '@/components/docs/ComponentDemo.vue'
import ComponentPlayground from '@/components/docs/ComponentPlayground.vue'
import type { PropDef } from '@/components/docs/ComponentPlayground.vue'
import ComponentTestRunner from '@/components/docs/ComponentTestRunner.vue'

const basicItems = [
  {
    value: 'item-1',
    title: 'What is Vueye?',
    content:
      'Vueye is a modular Vue 3 dashboard framework with built-in ecommerce modules, theming, and RBAC.',
  },
  {
    value: 'item-2',
    title: 'How does theming work?',
    content:
      'Themes are applied via CSS custom properties and Tailwind utility classes. Toggle between light and dark modes using the useTheme composable.',
  },
  {
    value: 'item-3',
    title: 'Is it open source?',
    content: 'Yes, Vueye is released under an open-source license. Contributions are welcome.',
  },
]

const faqItems = [
  {
    value: 'faq-1',
    title: 'How do I install Vueye?',
    content:
      'Clone the repository and run pnpm install to get started. See the installation guide for details.',
  },
  {
    value: 'faq-2',
    title: 'Can I use custom components?',
    content:
      'Absolutely. The Ui* wrapper pattern lets you swap underlying component providers without changing consumer code.',
  },
  {
    value: 'faq-3',
    title: 'Does it support SSR?',
    content:
      'Currently, Vueye is designed as a client-side SPA. SSR support may be planned for future releases.',
  },
  {
    value: 'faq-4',
    title: 'How do I add a new module?',
    content:
      'Create a new folder under src/modules/ with its own store, composables, pages, and components. Register it in the module index.',
  },
]

const richItems = [
  {
    value: 'rich-1',
    title: 'Getting Started',
    content:
      'Follow the quick start guide to set up your development environment. You will need Node.js 18+ and pnpm installed globally.',
  },
  {
    value: 'rich-2',
    title: 'Configuration',
    content:
      'Environment variables are managed through .env files. Runtime configuration is handled by the app store and persisted via useAppStorage.',
  },
  {
    value: 'rich-3',
    title: 'Deployment',
    content:
      'Build the project with pnpm build and deploy the dist/ directory to any static hosting provider like Vercel, Netlify, or Cloudflare Pages.',
  },
]

const propDefs: PropDef[] = [
  {
    name: 'type',
    type: 'select',
    default: 'single',
    options: [
      { label: 'single', value: 'single' },
      { label: 'multiple', value: 'multiple' },
    ],
  },
  { name: 'collapsible', type: 'boolean', default: false },
]

const usageCode = `<UiAccordion :items="basicItems" type="single" collapsible />`

const singleModeCode = `<UiAccordion :items="faqItems" type="single" collapsible />`

const multipleModeCode = `<UiAccordion :items="faqItems" type="multiple" />`

const defaultOpenCode = `<UiAccordion :items="basicItems" type="single" default-value="item-1" collapsible />`

const richContentCode = `<UiAccordion :items="richItems" type="single" collapsible />`

const apiProps: ApiPropRow[] = [
  {
    name: 'items',
    type: 'AccordionItem[]',
    default: '[]',
    description: 'Array of { value, title, content }',
  },
  {
    name: 'type',
    type: "'single' | 'multiple'",
    default: "'single'",
    description: 'Allow one or many open sections',
  },
  {
    name: 'collapsible',
    type: 'boolean',
    default: 'false',
    description: 'Allow closing the open section in single mode',
  },
  { name: 'defaultValue', type: 'string | string[]', description: 'Initially open section(s)' },
]

const apiSlots: ApiSlotRow[] = [
  { name: 'trigger-{value}', description: 'Custom trigger content for a specific item' },
  { name: 'content-{value}', description: 'Custom content for a specific item' },
]
</script>

<template>
  <div class="space-y-12">
    <header>
      <h1 class="mb-2 text-3xl font-bold">Accordion</h1>
      <p class="text-muted-foreground text-lg">
        Vertically stacked collapsible sections for organizing content.
      </p>
    </header>

    <!-- Usage -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Usage</h2>
      <ComponentDemo :code="usageCode">
        <UiAccordion :items="basicItems" type="single" collapsible />
      </ComponentDemo>
    </section>

    <!-- Single Mode -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Single Mode</h2>
      <p class="text-surface-500 text-sm">Only one section can be open at a time.</p>
      <ComponentDemo :code="singleModeCode">
        <UiAccordion :items="faqItems" type="single" collapsible />
      </ComponentDemo>
    </section>

    <!-- Multiple Mode -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Multiple Mode</h2>
      <p class="text-surface-500 text-sm">Multiple sections can be open simultaneously.</p>
      <ComponentDemo :code="multipleModeCode">
        <UiAccordion :items="faqItems" type="multiple" />
      </ComponentDemo>
    </section>

    <!-- Default Open -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Default Open</h2>
      <ComponentDemo :code="defaultOpenCode">
        <UiAccordion :items="basicItems" type="single" default-value="item-1" collapsible />
      </ComponentDemo>
    </section>

    <!-- Rich Content -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Rich Content</h2>
      <ComponentDemo :code="richContentCode">
        <UiAccordion :items="richItems" type="single" collapsible />
      </ComponentDemo>
    </section>

    <!-- Playground -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Playground</h2>
      <ComponentPlayground :prop-defs="propDefs">
        <template #default="{ props: p }">
          <UiAccordion v-bind="p" :items="basicItems" />
        </template>
      </ComponentPlayground>
    </section>

    <!-- Accessibility -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Accessibility</h2>
      <ComponentTestRunner>
        <UiAccordion :items="basicItems" type="single" collapsible />
        <UiAccordion :items="faqItems" type="multiple" />
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
