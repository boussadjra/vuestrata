<script setup lang="ts">
import { createColumns, useDataTable } from '@/composables/useDataTable'

import { orgTree, type OrgNode } from './data-table-fixtures'

const col = createColumns<OrgNode>()
const columns = [
  col.text('name', { label: 'Name', width: 256 }),
  col.text('role', { label: 'Role', width: 160 }),
]

const { table } = useDataTable({
  data: orgTree,
  columns,
  paginate: false,
  rowKey: 'id',
  getChildren: (row) => row.team,
})
</script>

<template>
  <UiDataGrid
    :table="table"
    expandable
    :show-pagination="false"
    :show-column-filters="false"
    aria-label="Organization"
    empty-text="No teams."
  />
</template>
