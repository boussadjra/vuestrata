<script setup lang="ts">
/**
 * Customer accounts — the server-backed list pattern.
 *
 * Search, sorting, filtering and pagination all happen on the server: the table
 * is told `manual*`, and `useServerTable` turns its state into query
 * parameters. Doing it client-side would mean shipping the whole book of
 * business to the browser in order to sort ten rows of it.
 */
import { createColumnHelper } from '@tanstack/vue-table'
import { h } from 'vue'
import { useI18n } from 'vue-i18n'

import { TableDateCell, TableLinkCell, TableMoneyCell, TableStatusCell } from '@/components/table'
import { UiButton, UiDataGrid, UiEmptyState, UiPageHeader, UiSelect } from '@/components/ui'
import { useRbac } from '@/composables/useRbac'
import { useServerTable } from '@/composables/useServerTable'
import { resolveIcon } from '@/config/icon-provider'

import { useCustomersQuery } from '../composables/useCustomers'
import {
  CUSTOMER_PLANS,
  CUSTOMER_STATUSES,
  type Customer,
  type CustomerFilters,
  type CustomerPlan,
  type CustomerStatus,
} from '../types'

const { t } = useI18n()
const { can } = useRbac()

const status = ref<CustomerStatus | 'all'>('all')
const plan = ref<CustomerPlan | 'all'>('all')

/**
 * The badge colour reinforces the label; it never carries the meaning alone
 * (WCAG 1.4.1). `TableStatusCell` always renders the text.
 */
const STATUS_VARIANT: Record<CustomerStatus, 'success' | 'warning' | 'error' | 'default'> = {
  active: 'success',
  trial: 'warning',
  prospect: 'default',
  churned: 'error',
}

const helper = createColumnHelper<Customer>()

// Rebuilt when the locale changes: headers are translated strings, and a
// `const` array computed once would keep the language the page loaded in.
const columns = computed(() => [
  helper.accessor('company', {
    header: () => t('customers_col_company'),
    cell: ({ row }) =>
      h(TableLinkCell, {
        to: `/dashboard/customers/${row.original.id}`,
        label: row.original.company,
        sublabel: `${row.original.city}, ${row.original.country}`,
      }),
    meta: { label: t('customers_col_company'), width: '18rem' },
  }),
  helper.accessor('contactName', {
    header: () => t('customers_col_contact'),
    meta: { label: t('customers_col_contact'), width: '14rem' },
  }),
  helper.accessor('status', {
    header: () => t('common_status'),
    cell: ({ row }) =>
      h(TableStatusCell, {
        label: t(`customers_status_${row.original.status}`),
        variant: STATUS_VARIANT[row.original.status],
      }),
    meta: { label: t('common_status'), width: '9rem' },
  }),
  helper.accessor('plan', {
    header: () => t('customers_col_plan'),
    cell: ({ row }) => t(`customers_plan_${row.original.plan}`),
    meta: { label: t('customers_col_plan'), width: '9rem' },
  }),
  helper.accessor('mrr', {
    header: () => t('customers_col_mrr'),
    cell: ({ row }) => h(TableMoneyCell, { value: row.original.mrr }),
    meta: { label: t('customers_col_mrr'), align: 'end', width: '9rem' },
  }),
  helper.accessor('lastContactAt', {
    header: () => t('customers_col_last_contact'),
    cell: ({ row }) => h(TableDateCell, { value: row.original.lastContactAt }),
    meta: { label: t('customers_col_last_contact'), align: 'end', width: '11rem' },
  }),
])

// `useServerTable` owns the table/query cycle. Wiring the two together by hand
// here reads fine and crashes at runtime: `useDataTable` evaluates `rowCount`
// during setup, before a `const meta` declared below it exists.
const { table, meta, isPending, isFetching, isError, refetch } = useServerTable<
  Customer,
  CustomerFilters
>({
  columns: columns.value,
  query: (filters) => useCustomersQuery(filters),
  extra: () => ({ status: status.value, plan: plan.value }),
  getRowId: (row) => row.id,
})

const statusOptions = computed(() => [
  { label: t('common_all'), value: 'all' },
  ...CUSTOMER_STATUSES.map((value) => ({ label: t(`customers_status_${value}`), value })),
])

const planOptions = computed(() => [
  { label: t('common_all'), value: 'all' },
  ...CUSTOMER_PLANS.map((value) => ({ label: t(`customers_plan_${value}`), value })),
])
</script>

<template>
  <div class="space-y-6">
    <UiPageHeader :title="t('customers_title')" :description="t('customers_subtitle')">
      <template #actions>
        <UiSelect
          v-model="status"
          class="min-w-40"
          :options="statusOptions"
          :aria-label="t('customers_filter_status')"
        />
        <UiSelect
          v-model="plan"
          class="min-w-40"
          :options="planOptions"
          :aria-label="t('customers_filter_plan')"
        />
        <UiButton v-if="can('customers:manage')" to="/dashboard/customers/new" variant="primary">
          <span :class="[resolveIcon('user-plus'), 'h-4 w-4']" aria-hidden="true" />
          {{ t('customers_new') }}
        </UiButton>
      </template>
    </UiPageHeader>

    <!--
      An error is not an empty list. Showing "no customers match" for a failed
      request tells the user their filters are wrong when in fact the data is
      simply unknown.
    -->
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
      :aria-label="t('customers_title')"
      :search-placeholder="t('customers_search_placeholder')"
      :empty-text="t('customers_empty')"
      :show-column-filters="false"
    />
  </div>
</template>
