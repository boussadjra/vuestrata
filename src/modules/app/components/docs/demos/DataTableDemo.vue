<script setup lang="ts">
import DataTableEmptyDemo from './DataTableEmptyDemo.vue'
import DataTableErrorDemo from './DataTableErrorDemo.vue'
import DataTableMinimalDemo from './DataTableMinimalDemo.vue'
import DataTablePublicApiDemo from './DataTablePublicApiDemo.vue'
import DataTableRichDemo from './DataTableRichDemo.vue'
import DataTableSelectionDemo from './DataTableSelectionDemo.vue'
import DataTableServerDemo from './DataTableServerDemo.vue'
import DataTableTreeDemo from './DataTableTreeDemo.vue'
import DataTableTypedCellsDemo from './DataTableTypedCellsDemo.vue'
import DataTableVirtualDemo from './DataTableVirtualDemo.vue'

const examples = [
  {
    title: 'Rich grid',
    description:
      'Toolbar search, column filters, row selection, column visibility, pagination, and expandable details.',
    component: DataTableRichDemo,
  },
  {
    title: 'Low-level renderer',
    description: 'UiDataTable when the page already owns toolbar and pagination chrome.',
    component: DataTableMinimalDemo,
  },
  {
    title: 'Server-side query',
    description:
      'useServerTable binds search, sort, and page to a collection query. Do not wire useDataTable to a query by hand.',
    component: DataTableServerDemo,
  },
  {
    title: 'Typed cells',
    description:
      'createColumns helpers for link, status, money, and date without hand-written h().',
    component: DataTableTypedCellsDemo,
  },
  {
    title: 'Row selection',
    description: 'selectable plus selectedRows from useDataTable for bulk actions.',
    component: DataTableSelectionDemo,
  },
  {
    title: 'Tree rows',
    description: 'getSubRows with a stable getRowId for expandable nested records.',
    component: DataTableTreeDemo,
  },
  {
    title: 'Virtual rows',
    description: 'Flat-row virtualization for long in-memory lists. 220 generated events here.',
    component: DataTableVirtualDemo,
  },
  {
    title: 'Empty state',
    description: 'An empty result set is not an error — the grid says so explicitly.',
    component: DataTableEmptyDemo,
  },
  {
    title: 'Error and retry',
    description: 'Pass :error and listen for @retry. Distinct from “no rows match”.',
    component: DataTableErrorDemo,
  },
  {
    title: 'Public API directory',
    description:
      'Live users from jsonplaceholder.typicode.com, with a 10-row local fallback if the request fails.',
    component: DataTablePublicApiDemo,
  },
]
</script>

<template>
  <div class="divide-border divide-y">
    <section
      v-for="example in examples"
      :key="example.title"
      class="space-y-4 py-8 first:pt-0 last:pb-0"
    >
      <div>
        <h3 class="text-foreground text-base font-semibold">{{ example.title }}</h3>
        <p class="text-muted-foreground mt-1 text-sm leading-6">{{ example.description }}</p>
      </div>
      <component :is="example.component" />
    </section>
  </div>
</template>
