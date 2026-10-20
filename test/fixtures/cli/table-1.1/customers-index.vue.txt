<script setup lang="ts">
/**
 * Customer accounts — the server-backed list pattern.
 *
 * Search, sorting, filtering and pagination all happen on the server: the table
 * is told `manual*`, and `useServerTable` turns its state into query
 * parameters. Doing it client-side would mean shipping the whole book of
 * business to the browser in order to sort ten rows of it.
 */
import { useI18n } from 'vue-i18n'

import { UiButton, UiDataGrid, UiPageHeader, UiSelect } from '@/components/ui'
import { createColumns } from '@/composables/useDataTable'
import { useRbac } from '@/composables/useRbac'
import { useServerTable } from '@/composables/useServerTable'
import { resolveIcon } from '@/config/icon-provider'

import { useCustomersQuery } from '../composables/useCustomers'
import { customerStatusVariant } from '../presentation'
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

const col = createColumns<Customer>()

// Rebuilt when the locale changes: headers are translated strings, and a
// `const` array computed once would keep the language the page loaded in.
const columns = computed(() => [
  col.link('company', {
    label: t('customers_col_company'),
    width: '18rem',
    to: (row) => `/dashboard/customers/${row.id}`,
    sublabel: (row) => `${row.city}, ${row.country}`,
  }),
  col.text('contactName', { label: t('customers_col_contact'), width: '14rem' }),
  col.status('status', {
    label: t('common_status'),
    variant: customerStatusVariant,
    labelFor: (value) => t(`customers_status_${value}`),
  }),
  col.text('plan', {
    label: t('customers_col_plan'),
    width: '9rem',
    format: (value) => t(`customers_plan_${value}`),
  }),
  col.money('mrr', { label: t('customers_col_mrr') }),
  col.date('lastContactAt', { label: t('customers_col_last_contact') }),
])

const { table, isLoading, isError, refetch } = useServerTable<Customer, CustomerFilters>({
  columns,
  query: useCustomersQuery,
  extra: () => ({ status: status.value, plan: plan.value }),
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

    <UiDataGrid
      :table="table"
      :loading="isLoading"
      :error="isError"
      :aria-label="t('customers_title')"
      :search-placeholder="t('customers_search_placeholder')"
      :empty-text="t('customers_empty')"
      @retry="refetch"
    />
  </div>
</template>
