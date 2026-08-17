<script setup lang="ts">
import { createColumnHelper } from '@tanstack/vue-table'
import { useI18n } from 'vue-i18n'

import { UiButton, UiDataGrid, UiPageHeader } from '@/components/ui'
import { useDataTable } from '@/composables/useDataTable'
import { resolveIcon } from '~/config/icon-provider'

import ShowcaseDocsLink from '../components/ShowcaseDocsLink.vue'

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
  columnHelper.accessor('id', {
    header: '#',
    meta: {
      label: '#',
      align: 'end',
      width: '4rem',
    },
  }),
  columnHelper.accessor('name', {
    header: () => t('tables_col_product'),
    meta: {
      label: t('tables_col_product'),
      filter: {
        variant: 'text',
        placeholder: t('tables_search'),
      },
      width: '18rem',
    },
  }),
  columnHelper.accessor('category', {
    header: () => t('tables_col_category'),
    meta: {
      label: t('tables_col_category'),
      filter: {
        variant: 'select',
        options: [
          { value: 'Electronics', label: t('tables_electronics') },
          { value: 'Accessories', label: t('tables_accessories') },
          { value: 'Furniture', label: t('tables_furniture') },
        ],
      },
      width: '11rem',
    },
  }),
  columnHelper.accessor('price', {
    header: () => t('tables_col_price'),
    cell: ({ row }) => `$${row.original.price.toFixed(2)}`,
    meta: {
      label: t('tables_col_price'),
      align: 'end',
      width: '8rem',
    },
  }),
  columnHelper.accessor('stock', {
    header: () => t('tables_col_stock'),
    cell: ({ row }) =>
      row.original.stock === 0 ? t('tables_out_of_stock') : row.original.stock.toLocaleString(),
    meta: {
      label: t('tables_col_stock'),
      align: 'end',
      width: '8rem',
    },
  }),
  columnHelper.accessor('status', {
    header: () => t('tables_col_status'),
    cell: ({ row }) =>
      h(
        'span',
        {
          class: [
            statusColors[row.original.status],
            'rounded-full px-2.5 py-1 text-xs font-semibold',
          ],
        },
        row.original.status,
      ),
    meta: {
      label: t('tables_col_status'),
      filter: {
        variant: 'select',
        options: [
          { value: 'active', label: t('tables_active') },
          { value: 'draft', label: t('tables_draft') },
          { value: 'archived', label: t('tables_archived') },
        ],
      },
      width: '9rem',
    },
  }),
  columnHelper.accessor('rating', {
    header: () => t('tables_col_rating'),
    cell: ({ row }) =>
      h('div', { class: 'flex items-center justify-center gap-1' }, [
        h('span', { class: [resolveIcon('star'), 'h-3.5 w-3.5 text-yellow-400'] }),
        h('span', { class: 'tabular-nums' }, row.original.rating.toFixed(1)),
      ]),
    meta: {
      label: t('tables_col_rating'),
      align: 'center',
      width: '7rem',
    },
  }),
  columnHelper.accessor('created', {
    header: () => t('tables_col_created'),
    cell: ({ row }) =>
      new Date(row.original.created).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    meta: {
      label: t('tables_col_created'),
      width: '10rem',
    },
  }),
]

const { table } = useDataTable<Product>({
  data: products,
  columns,
  enableFiltering: true,
  enableRowSelection: true,
  enableColumnVisibility: true,
  pageSize: 8,
  getRowId: (row) => String(row.id),
})

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
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <UiPageHeader :title="t('tables_title')" :description="t('tables_subtitle')">
      <template #actions>
        <UiButton variant="secondary" @click="exportCSV">
          <span :class="[resolveIcon('download'), 'h-4 w-4']" />
          {{ t('tables_export_csv') }}
        </UiButton>
      </template>
    </UiPageHeader>

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
      <UiDataGrid
        :table="table"
        selectable
        :search-placeholder="t('tables_search')"
        :page-size-options="[5, 8, 10, 20, 50]"
        :empty-text="t('tables_no_products')"
      />
    </div>
    {{ t('tables_active') }}
    <ShowcaseDocsLink
      to="/docs/components/data-tables"
      :title="t('tables_docs_title')"
      :body="t('tables_docs_body')"
    />
  </div>
</template>
