<script setup lang="ts">
import { createColumns, useDataTable } from '@/composables/useDataTable'

import {
  invoiceStatusLabel,
  invoiceStatusVariant,
  invoices,
  type InvoiceRow,
} from './data-table-fixtures'

const col = createColumns<InvoiceRow>()
const columns = [
  col.link('customer', {
    label: 'Customer',
    width: '16rem',
    to: '/components/data-table',
    sublabel: (row) => row.email,
  }),
  col.status('status', {
    label: 'Status',
    variant: invoiceStatusVariant,
    labelFor: invoiceStatusLabel,
  }),
  col.money('total', { label: 'Total' }),
  col.date('issuedAt', { label: 'Issued' }),
]

const { table } = useDataTable({
  data: invoices,
  columns,
  pageSize: 5,
  getRowId: (row) => row.id,
})
</script>

<template>
  <UiDataGrid
    :table="table"
    :show-column-filters="false"
    aria-label="Invoices"
    empty-text="No invoices."
  />
</template>
