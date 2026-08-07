<script setup lang="ts">
import ComponentApiTable from '@/components/docs/ComponentApiTable.vue'
import type { ApiPropRow, ApiEventRow } from '@/components/docs/ComponentApiTable.vue'
import ComponentDemo from '@/components/docs/ComponentDemo.vue'
import ComponentPlayground from '@/components/docs/ComponentPlayground.vue'
import type { PropDef } from '@/components/docs/ComponentPlayground.vue'
import ComponentTestRunner from '@/components/docs/ComponentTestRunner.vue'

const query = ref('')
const selectedCommand = ref('none')

const basicItems = [
  { id: 'new-file', label: 'Create new file', hint: 'Ctrl+N' },
  { id: 'open-settings', label: 'Open settings', hint: 'Ctrl+,' },
  { id: 'toggle-theme', label: 'Toggle dark mode', hint: 'Ctrl+J' },
  { id: 'run-tests', label: 'Run unit tests', hint: 'pnpm test:unit' },
]

const extendedItems = [
  { id: 'new-project', label: 'Create new project' },
  { id: 'open-recent', label: 'Open recent file' },
  { id: 'find-file', label: 'Find in files', hint: 'Ctrl+Shift+F' },
  { id: 'goto-line', label: 'Go to line', hint: 'Ctrl+G' },
  { id: 'format-doc', label: 'Format document', hint: 'Shift+Alt+F' },
  { id: 'toggle-terminal', label: 'Toggle terminal', hint: 'Ctrl+`' },
  { id: 'git-commit', label: 'Git: Commit changes' },
  { id: 'git-push', label: 'Git: Push to remote' },
]

function onSelect(id: string) {
  selectedCommand.value = id
}

const usageCode = `<UiCommandPalette v-model="query" :items="basicItems" @select="onSelect" />`

const extendedCode = `<UiCommandPalette :items="extendedItems" @select="onSelect" />`

const placeholderCode = `<UiCommandPalette :items="basicItems" placeholder="Search commands…" @select="onSelect" />`

const emptyCode = `<UiCommandPalette :items="[]" empty-text="No commands available" />`

const propDefs: PropDef[] = [
  { name: 'placeholder', type: 'string', default: 'Type a command…' },
  { name: 'emptyText', type: 'string', default: 'No results found' },
]

const apiProps: ApiPropRow[] = [
  { name: 'items', type: '{ id, label, hint? }[]', default: '[]', description: 'Command items' },
  { name: 'modelValue', type: 'string', default: "''", description: 'Search query (v-model)' },
  { name: 'placeholder', type: 'string', description: 'Search input placeholder' },
  { name: 'emptyText', type: 'string', description: 'Text shown when no results' },
]

const apiEvents: ApiEventRow[] = [
  {
    name: 'update:modelValue',
    payload: 'string',
    description: 'Emitted when search query changes',
  },
  {
    name: 'select',
    payload: 'string (item id)',
    description: 'Emitted when a command is selected',
  },
]
</script>

<template>
  <div class="space-y-12">
    <header>
      <h1 class="mb-2 text-3xl font-bold">CommandPalette</h1>
      <p class="text-muted-foreground text-lg">
        Searchable command launcher for quick keyboard-driven access to actions.
      </p>
    </header>

    <!-- Usage -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Usage</h2>
      <ComponentDemo :code="usageCode">
        <div class="max-w-lg">
          <UiCommandPalette v-model="query" :items="basicItems" @select="onSelect" />
          <p class="text-surface-500 mt-3 text-xs">
            Selected: <span class="font-medium">{{ selectedCommand }}</span>
          </p>
        </div>
      </ComponentDemo>
    </section>

    <!-- Many Items -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Extended List</h2>
      <p class="text-surface-500 text-sm">
        Works well with longer lists — the search filters results in real time.
      </p>
      <ComponentDemo :code="extendedCode">
        <div class="max-w-lg">
          <UiCommandPalette :items="extendedItems" @select="onSelect" />
        </div>
      </ComponentDemo>
    </section>

    <!-- Custom Placeholder -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Custom Placeholder</h2>
      <ComponentDemo :code="placeholderCode">
        <div class="max-w-lg">
          <UiCommandPalette :items="basicItems" placeholder="Search commands…" @select="onSelect" />
        </div>
      </ComponentDemo>
    </section>

    <!-- Empty State -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Empty State</h2>
      <p class="text-surface-500 text-sm">
        Customize the empty state text with the
        <code class="bg-surface-100 dark:bg-surface-800 rounded px-1.5 py-0.5 text-xs"
          >emptyText</code
        >
        prop.
      </p>
      <ComponentDemo :code="emptyCode">
        <div class="max-w-lg">
          <UiCommandPalette :items="[]" empty-text="No commands available" />
        </div>
      </ComponentDemo>
    </section>

    <!-- Playground -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Playground</h2>
      <ComponentPlayground :prop-defs="propDefs">
        <template #default="{ props: p }">
          <div class="max-w-lg">
            <UiCommandPalette :items="basicItems" v-bind="p" @select="onSelect" />
          </div>
        </template>
      </ComponentPlayground>
    </section>

    <!-- Accessibility -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Accessibility</h2>
      <ComponentTestRunner>
        <div class="max-w-lg">
          <UiCommandPalette :items="basicItems" @select="onSelect" />
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
