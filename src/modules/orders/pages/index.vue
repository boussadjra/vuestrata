<script setup lang="ts">
/**
 * Orders list.
 *
 * Same server-backed table contract as customers; the interesting difference is
 * that this list is sorted by date descending by default, because an order list
 * is read newest-first and alphabetical order of a reference number tells
 * nobody anything.
 */
import { createColumnHelper } from '@tanstack/vue-table'
import { h } from 'vue'
import { useI18n } from 'vue-i18n'

import { TableDateCell, TableLinkCell, TableMoneyCell, TableStatusCell } from '@/components/table'
import { UiButton, UiDataGrid, UiEmptyState, UiPageHeader, UiSelect } from '@/components/ui'
import { useRbac } from '@/composables/useRbac'
import { useServerTable } from '@/composables/useServerTable'
import { resolveIcon } from '@/config/icon-provider'

import { useOrdersQuery } from '../composables/useOrders'
import { orderItemCount, orderStatusVariant } from '../presentation'
import {
  ORDER_CHANNELS,
  ORDER_STATUSES,
  type Order,
  type OrderChannel,
  type OrderFilters,
  type OrderStatus,
} from '../types'

const { t } = useI18n()
const { can } = useRbac()

const status = ref<OrderStatus | 'all'>('all')
const channel = ref<OrderChannel | 'all'>('all')

const helper = createColumnHelper<Order>()
const columns = computed(() => [
  helper.accessor('reference', {
    header: () => t('orders_col_reference'),
    cell: ({ row }) =>
      h(TableLinkCell, {
        to: `/dashboard/orders/${row.original.id}`,
        label: row.original.reference,
        sublabel: row.original.customerName,
      }),
    meta: { label: t('orders_col_reference'), width: '16rem' },
  }),
  helper.accessor('status', {
    header: () => t('common_status'),
    cell: ({ row }) =>
      h(TableStatusCell, {
        label: t(`orders_status_${row.original.status}`),
        variant: orderStatusVariant(row.original.status),
      }),
    meta: { label: t('common_status'), width: '9rem' },
  }),
  helper.accessor('channel', {
    header: () => t('orders_col_channel'),
    cell: ({ row }) => t(`orders_channel_${row.original.channel}`),
    meta: { label: t('orders_col_channel'), width: '9rem' },
  }),
  helper.display({
    id: 'items',
    header: () => t('orders_col_items'),
    cell: ({ row }) => orderItemCount(row.original),
    meta: { label: t('orders_col_items'), align: 'end', width: '7rem' },
  }),
  helper.accessor('total', {
    header: () => t('common_total'),
    cell: ({ row }) => h(TableMoneyCell, { value: row.original.total }),
    meta: { label: t('common_total'), align: 'end', width: '10rem' },
  }),
  helper.accessor('placedAt', {
    header: () => t('orders_col_placed'),
    cell: ({ row }) => h(TableDateCell, { value: row.original.placedAt }),
    meta: { label: t('orders_col_placed'), align: 'end', width: '11rem' },
  }),
])

// See `useServerTable`: it owns the table↔query initialisation order, which is
// a temporal dead zone if a page wires the two together itself.
const { table, meta, isPending, isFetching, isError, refetch } = useServerTable<
  Order,
  OrderFilters
>({
  columns: columns.value,
  query: (filters) => useOrdersQuery(filters),
  extra: () => ({ status: status.value, channel: channel.value }),
  getRowId: (row) => row.id,
})

const statusOptions = computed(() => [
  { label: t('common_all'), value: 'all' },
  ...ORDER_STATUSES.map((value) => ({ label: t(`orders_status_${value}`), value })),
])
const channelOptions = computed(() => [
  { label: t('common_all'), value: 'all' },
  ...ORDER_CHANNELS.map((value) => ({ label: t(`orders_channel_${value}`), value })),
])
</script>

<template>
  <div class="space-y-6">
    <UiPageHeader :title="t('orders_title')" :description="t('orders_subtitle')">
      <template #actions>
        <UiSelect
          v-model="status"
          class="min-w-40"
          :options="statusOptions"
          :aria-label="t('orders_filter_status')"
        />
        <UiSelect
          v-model="channel"
          class="min-w-40"
          :options="channelOptions"
          :aria-label="t('orders_filter_channel')"
        />
        <UiButton v-if="can('orders:manage')" to="/dashboard/orders/new" variant="primary">
          <span :class="[resolveIcon('document-add'), 'h-4 w-4']" aria-hidden="true" />
          {{ t('orders_new') }}
        </UiButton>
      </template>
    </UiPageHeader>

    <UiEmptyState
      v-if="isError"
      variant="error"
      :title="t('common_error_title')"
      :description="t('common_error_body')"
    >
      <UiButton variant="ghost" @click="refetch">{{ t('common_retry') }}</UiButton>
    </UiEmptyState>

    <UiDataGrid
      v-else
      :table="table"
      :loading="isPending || isFetching"
      :total-rows="meta?.total"
      :aria-label="t('orders_title')"
      :search-placeholder="t('orders_search_placeholder')"
      :empty-text="t('orders_empty')"
      :show-column-filters="false"
    />
  </div>
</template>
