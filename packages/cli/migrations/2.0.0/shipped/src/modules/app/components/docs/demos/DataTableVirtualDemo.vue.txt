<script setup lang="ts">
import { createColumns, useDataTable } from '@/composables/useDataTable'

import { makeLogRows, type LogRow } from './data-table-fixtures'

const rows = makeLogRows(220)
const col = createColumns<LogRow>()
const columns = [
  col.text('id', { label: 'Id', width: 128 }),
  col.text('event', { label: 'Event' }),
  col.text('source', {
    label: 'Source',
    width: 144,
    filter: {
      variant: 'select',
      options: [
        { label: 'api', value: 'api' },
        { label: 'worker', value: 'worker' },
        { label: 'scheduler', value: 'scheduler' },
        { label: 'webhook', value: 'webhook' },
      ],
    },
  }),
  col.text('durationMs', {
    label: 'Duration',
    align: 'end',
    width: 144,
    format: (ms) => `${ms} ms`,
  }),
]

const { table } = useDataTable({
  data: rows,
  columns,
  paginate: false,
  rowKey: (row) => row.id,
})
</script>

<template>
  <UiDataGrid
    :table="table"
    virtual
    :show-pagination="false"
    max-body-height="20rem"
    aria-label="Event log"
    empty-text="No events."
  />
</template>
