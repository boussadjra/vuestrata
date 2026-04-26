<script setup lang="ts">
import type { Table } from '@tanstack/vue-table'

import { resolveUiComponent } from '@/config/ui-provider'

defineProps<{
  table: Table<any>
  emptyText?: string
}>()

const ResolvedDataTable = resolveUiComponent('DataTable')
</script>

<template>
  <ResolvedDataTable :table="table" :empty-text="emptyText">
    <slot />
  </ResolvedDataTable>
</template>
