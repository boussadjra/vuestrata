<script setup lang="ts">
import { createColumnHelper } from '@tanstack/vue-table'
import { FlexRender } from '@tanstack/vue-table'
import { useI18n } from 'vue-i18n'

import { UiButton, UiSelect, UiTextField } from '@/components/ui'
import { useDataTable } from '@/composables/useDataTable'
import { resolveIcon } from '~/config/icon-provider'

const { t } = useI18n()

interface Product {
  id: number
  name: string
  category: string
  price: number
  stock: number
  status: 'active' | 'draft' | 'archived'
  rating: number
  created: string
}

const products: Product[] = [
  {
    id: 1,
    name: 'Wireless Headphones Pro',
    category: 'Electronics',
    price: 299.99,
    stock: 142,
    status: 'active',
    rating: 4.8,
    created: '2025-11-15',
  },
  {
    id: 2,
    name: 'Ergonomic Keyboard',
    category: 'Electronics',
    price: 189.0,
    stock: 89,
    status: 'active',
    rating: 4.6,
    created: '2025-10-20',
  },
  {
    id: 3,
    name: 'Standing Desk Converter',
    category: 'Furniture',
    price: 449.0,
    stock: 34,
    status: 'active',
    rating: 4.7,
    created: '2025-09-05',
  },
  {
    id: 4,
    name: 'Noise Canceling Earbuds',
    category: 'Electronics',
    price: 179.99,
    stock: 256,
    status: 'active',
    rating: 4.5,
    created: '2025-12-01',
  },
  {
    id: 5,
    name: 'USB-C Hub 10-in-1',
    category: 'Accessories',
    price: 69.99,
    stock: 412,
    status: 'active',
    rating: 4.3,
    created: '2025-08-18',
  },
  {
    id: 6,
    name: 'Monitor Light Bar',
    category: 'Accessories',
    price: 89.99,
    stock: 0,
    status: 'archived',
    rating: 4.1,
    created: '2025-06-10',
  },
  {
    id: 7,
    name: 'Mechanical Mouse',
    category: 'Electronics',
    price: 129.0,
    stock: 67,
    status: 'active',
    rating: 4.4,
    created: '2025-11-28',
  },
  {
    id: 8,
    name: 'Desk Pad XL',
    category: 'Accessories',
    price: 39.99,
    stock: 823,
    status: 'active',
    rating: 4.2,
    created: '2025-07-22',
  },
  {
    id: 9,
    name: 'Webcam 4K',
    category: 'Electronics',
    price: 199.0,
    stock: 51,
    status: 'active',
    rating: 4.6,
    created: '2025-10-10',
  },
  {
    id: 10,
    name: 'Cable Management Kit',
    category: 'Accessories',
    price: 24.99,
    stock: 1200,
    status: 'active',
    rating: 3.9,
    created: '2025-05-15',
  },
  {
    id: 11,
    name: 'Laptop Stand Aluminum',
    category: 'Accessories',
    price: 79.99,
    stock: 180,
    status: 'active',
    rating: 4.5,
    created: '2025-09-30',
  },
  {
    id: 12,
    name: 'Smart Power Strip',
    category: 'Electronics',
    price: 49.99,
    stock: 310,
    status: 'draft',
    rating: 4.0,
    created: '2026-01-05',
  },
  {
    id: 13,
    name: 'Acoustic Panels (4-pack)',
    category: 'Furniture',
    price: 119.0,
    stock: 75,
    status: 'active',
    rating: 4.3,
    created: '2025-11-01',
  },
  {
    id: 14,
    name: 'Wrist Rest Gel',
    category: 'Accessories',
    price: 19.99,
    stock: 950,
    status: 'active',
    rating: 4.1,
    created: '2025-04-20',
  },
  {
    id: 15,
    name: 'Monitor Arm Dual',
    category: 'Furniture',
    price: 189.0,
    stock: 42,
    status: 'active',
    rating: 4.7,
    created: '2025-08-12',
  },
  {
    id: 16,
    name: 'Portable SSD 2TB',
    category: 'Electronics',
    price: 159.0,
    stock: 228,
    status: 'active',
    rating: 4.8,
    created: '2025-12-20',
  },
  {
    id: 17,
    name: 'Blue Light Glasses',
    category: 'Accessories',
    price: 34.99,
    stock: 560,
    status: 'draft',
    rating: 3.8,
    created: '2026-02-01',
  },
  {
    id: 18,
    name: 'Desk Organizer Wood',
    category: 'Furniture',
    price: 59.99,
    stock: 145,
    status: 'active',
    rating: 4.4,
    created: '2025-10-05',
  },
  {
    id: 19,
    name: 'USB Microphone',
    category: 'Electronics',
    price: 149.0,
    stock: 93,
    status: 'active',
    rating: 4.6,
    created: '2025-09-18',
  },
  {
    id: 20,
    name: 'Ergonomic Mouse Pad',
    category: 'Accessories',
    price: 29.99,
    stock: 720,
    status: 'active',
    rating: 4.0,
    created: '2025-07-08',
  },
]

const columnHelper = createColumnHelper<Product>()

const columns = [
  columnHelper.display({
    id: 'select',
    header: ({ table }) =>
      h('input', {
        type: 'checkbox',
        checked: table.getIsAllPageRowsSelected(),
        onChange: (e: Event) =>
          table.toggleAllPageRowsSelected((e.target as HTMLInputElement).checked),
        class: 'rounded border-surface-300 dark:border-surface-600 accent-primary-500',
      }),
    cell: ({ row }) =>
      h('input', {
        type: 'checkbox',
        checked: row.getIsSelected(),
        onChange: () => row.toggleSelected(),
        class: 'rounded border-surface-300 dark:border-surface-600 accent-primary-500',
      }),
    size: 40,
  }),
  columnHelper.accessor('id', {
    header: '#',
    size: 60,
  }),
  columnHelper.accessor('name', {
    header: () => t('tables_col_product'),
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('category', {
    header: () => t('tables_col_category'),
    filterFn: 'equals',
  }),
  columnHelper.accessor('price', {
    header: () => t('tables_col_price'),
    cell: (info) => `$${info.getValue().toFixed(2)}`,
  }),
  columnHelper.accessor('stock', {
    header: () => t('tables_col_stock'),
  }),
  columnHelper.accessor('status', {
    header: () => t('tables_col_status'),
    filterFn: 'equals',
  }),
  columnHelper.accessor('rating', {
    header: () => t('tables_col_rating'),
    cell: (info) => `${info.getValue()}/5.0`,
  }),
  columnHelper.accessor('created', {
    header: () => t('tables_col_created'),
    cell: (info) =>
      new Date(info.getValue()).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
  }),
]

const {
  table,
  globalFilter,
  sorting,
  columnVisibility,
  rowSelection,
  pagination,
  selectedRows,
  totalRows,
  pageCount,
  currentPage,
} = useDataTable<Product>({
  data: products,
  columns,
  enableRowSelection: true,
  enableColumnVisibility: true,
  pageSize: 8,
})

const showColumnPicker = ref(false)
const categoryFilter = ref('')

function setCategoryFilter(cat: string) {
  categoryFilter.value = cat
  const col = table.getColumn('category')
  col?.setFilterValue(cat || undefined)
}

function setStatusFilter(status: string) {
  const col = table.getColumn('status')
  col?.setFilterValue(status || undefined)
}

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  draft: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  archived: 'bg-surface-100 text-surface-500 dark:bg-surface-700 dark:text-surface-400',
}

function exportCSV() {
  const rows = table.getFilteredRowModel().rows
  const headers = [
    'ID',
    t('tables_col_product'),
    t('tables_col_category'),
    t('tables_col_price'),
    t('tables_col_stock'),
    t('tables_col_status'),
    t('tables_col_rating'),
    t('tables_col_created'),
  ]
  const csv = [
    headers.join(','),
    ...rows.map((r) =>
      [
        r.original.id,
        `"${r.original.name}"`,
        r.original.category,
        r.original.price,
        r.original.stock,
        r.original.status,
        r.original.rating,
        r.original.created,
      ].join(','),
    ),
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'products.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function onPageSizeChange(event: Event) {
  pagination.value = {
    ...pagination.value,
    pageSize: Number((event.target as HTMLSelectElement).value),
    pageIndex: 0,
  }
}
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 class="text-surface-900 text-3xl font-extrabold tracking-tight dark:text-white">
          {{ t('tables_title') }}
        </h1>
        <p class="text-surface-500 dark:text-surface-400 mt-1">{{ t('tables_subtitle') }}</p>
      </div>
      <div class="flex gap-3">
        <UiButton variant="secondary" @click="exportCSV">
          <span :class="[resolveIcon('download'), 'h-4 w-4']" />
          {{ t('tables_export_csv') }}
        </UiButton>
        <div class="relative">
          <UiButton variant="secondary" @click="showColumnPicker = !showColumnPicker">
            <span :class="[resolveIcon('tuning'), 'h-4 w-4']" />
            {{ t('common_columns') }}
          </UiButton>
          <div
            v-if="showColumnPicker"
            class="dark:bg-surface-800 border-surface-200 dark:border-surface-700 absolute top-full right-0 z-10 mt-2 min-w-48 rounded-xl border bg-white p-3 shadow-lg"
          >
            <label
              v-for="col in table
                .getAllLeafColumns()
                .filter((c) => c.getCanHide() && c.id !== 'select')"
              :key="col.id"
              class="hover:bg-surface-100 dark:hover:bg-surface-700 flex items-center gap-2 rounded px-2 py-1.5"
            >
              <input
                :checked="col.getIsVisible()"
                class="border-surface-300 dark:border-surface-600 accent-primary-500 rounded"
                @change="col.toggleVisibility()"
              />
              <span class="text-surface-600 dark:text-surface-300 text-sm capitalize">{{
                col.id
              }}</span>
            </label>
          </div>
        </div>
      </div>
    </div>

    <!-- Features badges -->
    <div class="flex flex-wrap gap-2">
      <span
        class="bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 rounded-full px-3 py-1 text-xs font-semibold"
        >{{ t('tables_sortable') }}</span
      >
      <span
        class="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
        >{{ t('tables_filterable') }}</span
      >
      <span
        class="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400"
        >{{ t('tables_row_selection') }}</span
      >
      <span
        class="rounded-full bg-cyan-100 px-3 py-1 text-xs font-semibold text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400"
        >{{ t('tables_column_visibility') }}</span
      >
      <span
        class="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
        >{{ t('tables_paginated') }}</span
      >
      <span
        class="bg-secondary-100 text-secondary-700 dark:bg-secondary-900/30 dark:text-secondary-400 rounded-full px-3 py-1 text-xs font-semibold"
        >{{ t('tables_csv_export') }}</span
      >
    </div>

    <!-- Table Card -->
    <div
      class="dark:bg-surface-800/90 border-surface-200 dark:border-surface-700 overflow-hidden rounded-2xl border bg-white/90 shadow-sm"
    >
      <!-- Toolbar -->
      <div
        class="border-surface-200 dark:border-surface-700 flex flex-col items-start justify-between gap-3 border-b p-4 sm:flex-row sm:items-center"
      >
        <div class="flex flex-wrap items-center gap-3">
          <UiTextField
            v-model="globalFilter"
            type="text"
            :placeholder="t('tables_search')"
            icon="search"
            class="w-64"
          />
          <UiSelect
            :model-value="categoryFilter"
            :options="[
              { value: '', label: t('tables_all_categories') },
              { value: 'Electronics', label: t('tables_electronics') },
              { value: 'Accessories', label: t('tables_accessories') },
              { value: 'Furniture', label: t('tables_furniture') },
            ]"
            size="sm"
            @update:model-value="setCategoryFilter"
          />
          <UiSelect
            :options="[
              { value: '', label: t('tables_all_statuses') },
              { value: 'active', label: t('tables_active') },
              { value: 'draft', label: t('tables_draft') },
              { value: 'archived', label: t('tables_archived') },
            ]"
            size="sm"
            @update:model-value="setStatusFilter"
          />
        </div>
        <div class="flex items-center gap-3">
          <span v-if="selectedRows.length" class="text-primary-600 text-sm font-medium">
            {{ selectedRows.length }} {{ t('common_selected') }}
          </span>
          <span class="text-surface-500 text-sm tabular-nums">
            {{ totalRows }} {{ t('common_results') }}
          </span>
        </div>
      </div>

      <!-- Table -->
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr
              v-for="headerGroup in table.getHeaderGroups()"
              :key="headerGroup.id"
              class="border-surface-200 dark:border-surface-700 border-b"
            >
              <th
                v-for="header in headerGroup.headers"
                :key="header.id"
                :style="{ width: header.getSize() !== 150 ? header.getSize() + 'px' : undefined }"
                class="text-surface-600 dark:text-surface-300 bg-surface-50/50 dark:bg-surface-900/50 px-4 py-3 text-left font-semibold"
                :class="{
                  'hover:text-primary-500 cursor-pointer transition-colors select-none':
                    header.column.getCanSort(),
                }"
                @click="header.column.getToggleSortingHandler()?.($event)"
              >
                <div class="flex items-center gap-1.5">
                  <FlexRender
                    v-if="!header.isPlaceholder"
                    :render="header.column.columnDef.header"
                    :props="header.getContext()"
                  />
                  <span
                    v-if="header.column.getIsSorted() === 'asc'"
                    :class="[resolveIcon('arrow-up'), 'text-primary-500 h-3 w-3']"
                  />
                  <span
                    v-else-if="header.column.getIsSorted() === 'desc'"
                    :class="[resolveIcon('arrow-down'), 'text-primary-500 h-3 w-3']"
                  />
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in table.getRowModel().rows"
              :key="row.id"
              class="border-surface-100 dark:border-surface-800 hover:bg-surface-50/80 dark:hover:bg-surface-800/50 border-b transition-colors"
              :class="{ 'bg-primary-50/40 dark:bg-primary-900/10': row.getIsSelected() }"
            >
              <td v-for="cell in row.getVisibleCells()" :key="cell.id" class="px-4 py-3">
                <template v-if="cell.column.id === 'status'">
                  <span
                    :class="[
                      statusColors[row.original.status],
                      'rounded-full px-2.5 py-1 text-xs font-semibold',
                    ]"
                  >
                    {{ row.original.status }}
                  </span>
                </template>
                <template v-else-if="cell.column.id === 'stock'">
                  <span
                    :class="
                      row.original.stock === 0
                        ? 'font-semibold text-red-500'
                        : row.original.stock < 50
                          ? 'text-yellow-600 dark:text-yellow-400'
                          : ''
                    "
                  >
                    {{
                      row.original.stock === 0
                        ? t('tables_out_of_stock')
                        : row.original.stock.toLocaleString()
                    }}
                  </span>
                </template>
                <template v-else-if="cell.column.id === 'rating'">
                  <div class="flex items-center gap-1">
                    <span :class="[resolveIcon('star'), 'h-3.5 w-3.5 text-yellow-400']" />
                    <span class="tabular-nums">{{ row.original.rating }}</span>
                  </div>
                </template>
                <template v-else-if="cell.column.id === 'price'">
                  <span class="font-medium tabular-nums">${{ row.original.price.toFixed(2) }}</span>
                </template>
                <template v-else>
                  <FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
                </template>
              </td>
            </tr>
            <tr v-if="table.getRowModel().rows.length === 0">
              <td
                :colspan="table.getVisibleLeafColumns().length"
                class="text-surface-400 px-4 py-12 text-center"
              >
                <span :class="[resolveIcon('zoom-in'), 'mx-auto mb-2 block h-8 w-8']" />
                <p>{{ t('tables_no_products') }}</p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div
        class="border-surface-200 dark:border-surface-700 flex flex-col items-center justify-between gap-3 border-t p-4 sm:flex-row"
      >
        <div class="flex items-center gap-2">
          <span class="text-surface-500 text-sm">{{ t('common_rows_per_page') }}:</span>
          <select
            :value="pagination.pageSize"
            class="border-surface-200 dark:border-surface-700 dark:bg-surface-900 rounded-lg border bg-white px-2 py-1 text-sm outline-none"
            @change="onPageSizeChange"
          >
            <option v-for="s in [5, 8, 10, 20, 50]" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>
        <div class="flex items-center gap-2">
          <button
            :disabled="!table.getCanPreviousPage()"
            class="border-surface-200 dark:border-surface-700 hover:bg-surface-100 dark:hover:bg-surface-800 rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:opacity-40"
            @click="table.firstPage()"
          >
            «
          </button>
          <button
            :disabled="!table.getCanPreviousPage()"
            class="border-surface-200 dark:border-surface-700 hover:bg-surface-100 dark:hover:bg-surface-800 rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:opacity-40"
            @click="table.previousPage()"
          >
            {{ t('common_previous') }}
          </button>
          <span
            class="text-surface-600 dark:text-surface-300 px-2 text-sm font-medium tabular-nums"
          >
            {{ currentPage }} / {{ pageCount }}
          </span>
          <button
            :disabled="!table.getCanNextPage()"
            class="border-surface-200 dark:border-surface-700 hover:bg-surface-100 dark:hover:bg-surface-800 rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:opacity-40"
            @click="table.nextPage()"
          >
            {{ t('common_next') }}
          </button>
          <button
            :disabled="!table.getCanNextPage()"
            class="border-surface-200 dark:border-surface-700 hover:bg-surface-100 dark:hover:bg-surface-800 rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:opacity-40"
            @click="table.lastPage()"
          >
            »
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
