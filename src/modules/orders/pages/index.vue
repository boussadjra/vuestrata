<script setup lang="ts">
/**
 * Orders list.
 *
 * Same server-backed table contract as customers; the interesting difference is
 * that this list is sorted by date descending by default, because an order list
 * is read newest-first and alphabetical order of a reference number tells
 * nobody anything.
 */
import { useI18n } from 'vue-i18n'

import { UiButton, UiDataGrid, UiPageHeader, UiSelect } from '@/components/ui'
import { createColumns } from '@/composables/useDataTable'
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

const col = createColumns<Order>()
const columns = computed(() => [
  col.link('reference', {
    label: t('orders_col_reference'),
    width: '16rem',
    to: (row) => `/dashboard/orders/${row.id}`,
    sublabel: (row) => row.customerName,
  }),
  col.status('status', {
    label: t('common_status'),
    variant: orderStatusVariant,
    labelFor: (value) => t(`orders_status_${value}`),
  }),
  col.text('channel', {
    label: t('orders_col_channel'),
    width: '9rem',
    format: (value) => t(`orders_channel_${value}`),
  }),
  col.display('items', {
    label: t('orders_col_items'),
    align: 'end',
    width: '7rem',
    cell: (row) => orderItemCount(row),
  }),
  col.money('total', { label: t('common_total'), width: '10rem' }),
  col.date('placedAt', { label: t('orders_col_placed') }),
])

const { table, isLoading, isError, refetch } = useServerTable<Order, OrderFilters>({
  columns,
  query: useOrdersQuery,
  extra: () => ({ status: status.value, channel: channel.value }),
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

    <UiDataGrid
      :table="table"
      :loading="isLoading"
      :error="isError"
      :aria-label="t('orders_title')"
      :search-placeholder="t('orders_search_placeholder')"
      :empty-text="t('orders_empty')"
      @retry="refetch"
    />
  </div>
</template>
