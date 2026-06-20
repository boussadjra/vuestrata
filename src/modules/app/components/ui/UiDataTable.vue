<script setup lang="ts" generic="TData extends RowData">
import type { RowData, Table } from '@tanstack/vue-table'

import { resolveUiComponent } from '@/config/ui-provider'

defineProps<{
  table: Table<TData>
  emptyText?: string
}>()

const ResolvedDataTable = resolveUiComponent('DataTable')
</script>

<template>
  <ResolvedDataTable :table="table" :empty-text="emptyText">
    <slot />
  </ResolvedDataTable>
</template>
