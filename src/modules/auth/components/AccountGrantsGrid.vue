<script setup lang="ts">
/**
 * Effective grants as a client-side data grid.
 *
 * Copy goes through `accountT()` so `@intlify/unplugin-vue-i18n` cannot
 * compile the headers against a partial catalog and render the key itself.
 */
import { h } from 'vue'

import { UiDataGrid } from '@/components/ui'
import { createColumns, useDataTable } from '@/composables/useDataTable'
import { permissionActionRank, usePermissionLabels } from '@/composables/usePermissionLabels'
import { getI18n } from '@/plugins/i18n'

import { accountT, ensureAccountMessages } from '../ensure-account-i18n'

export interface GrantRow {
  token: string
  resource: string
  label: string
}

const props = defineProps<{
  tokens: readonly string[]
}>()

ensureAccountMessages()

const locale = getI18n().global.locale
const { permLabel, permNamespaceLabel, compareLabels } = usePermissionLabels()

const rows = computed<GrantRow[]>(() => {
  void locale.value
  return [...props.tokens]
    .map((token) => {
      const ns = token.includes(':') ? token.slice(0, token.indexOf(':')) : token
      return {
        token,
        resource: permNamespaceLabel(ns),
        label: permLabel(token),
      }
    })
    .sort(
      (a, b) =>
        compareLabels(a.resource, b.resource) ||
        permissionActionRank(a.token) - permissionActionRank(b.token) ||
        compareLabels(a.label, b.label),
    )
})

const col = createColumns<GrantRow>()
const columns = computed(() => {
  void locale.value
  return [
    col.text('resource', {
      label: accountT('account_permissions_col_resource'),
      width: '11rem',
    }),
    col.text('label', {
      label: accountT('account_permissions_col_grant'),
    }),
    {
      accessorKey: 'token',
      header: accountT('account_permissions_col_token'),
      enableSorting: true,
      meta: {
        label: accountT('account_permissions_col_token'),
        width: '14rem',
      },
      cell: ({ row }) =>
        h(
          'code',
          {
            'data-permission': row.original.token,
            dir: 'ltr',
            class: 'text-foreground font-mono text-xs whitespace-nowrap',
          },
          row.original.token,
        ),
    },
  ]
})

const { table } = useDataTable({
  data: () => rows.value,
  columns,
  enablePagination: false,
  enableColumnVisibility: false,
  getRowId: (row) => row.token,
})

const searchPlaceholder = computed(() => {
  void locale.value
  return accountT('account_permissions_search')
})
const emptyText = computed(() => {
  void locale.value
  return accountT('account_permissions_empty')
})
const gridLabel = computed(() => {
  void locale.value
  return accountT('account_permissions_title')
})
</script>

<template>
  <UiDataGrid
    :table="table"
    embedded
    :show-column-visibility="false"
    :show-column-filters="false"
    :show-pagination="false"
    :show-footer="false"
    max-body-height="18rem"
    :search-placeholder="searchPlaceholder"
    :empty-text="emptyText"
    :aria-label="gridLabel"
  />
</template>
