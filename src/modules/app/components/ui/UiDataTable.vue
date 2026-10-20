<script setup lang="ts" generic="TData">
import type { DataTableBinding } from '@vueye-table/vue'
import { defineAsyncComponent, type VNodeChild } from 'vue'

import type { TableCellContext } from '@/composables/table-columns'

const props = defineProps<{
  table: DataTableBinding<TData>
  emptyText?: string
  ariaLabel?: string
}>()

const slots =
  defineSlots<Partial<Record<`cell-${string}`, (props: TableCellContext<TData>) => VNodeChild>>>()

const slotNames = computed(() => Object.keys(slots) as (keyof typeof slots)[])
const Renderer = defineAsyncComponent(() => import('./table/NativeDataTable.vue'))
</script>

<template>
  <Renderer v-bind="props">
    <template v-for="name in slotNames" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps as TableCellContext<TData>" />
    </template>
  </Renderer>
</template>
