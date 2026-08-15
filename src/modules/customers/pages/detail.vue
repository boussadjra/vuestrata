<script setup lang="ts">
/**
 * Customer detail — the record page pattern.
 *
 * Three states, kept distinct: pending, not-found, and loaded. A 404 is not a
 * transient error and must not offer "retry" — the record is gone, and the only
 * useful action is to go back to the list.
 */
import { useI18n } from 'vue-i18n'

import { UiBadge, UiButton, UiCard, UiEmptyState, UiPageHeader, UiSkeleton } from '@/components/ui'
import { useBreadcrumbLabel } from '@/composables/useBreadcrumbs'
import { useFormatters } from '@/composables/useFormatters'
import { useRbac } from '@/composables/useRbac'
import { useRouteParam } from '@/composables/useRouteParam'
import { resolveIcon } from '@/config/icon-provider'
import { isNotFoundError } from '~/lib/errors'

import { useCustomerQuery } from '../composables/useCustomers'
import { customerStatusVariant } from '../presentation'

const { t } = useI18n()
const { can } = useRbac()
const { currency, date, relativeTime, number } = useFormatters()
const id = useRouteParam('id')
const { item: customer, isPending, isError, error, refetch } = useCustomerQuery(id)

// Replaces the trailing breadcrumb, so the trail reads
// "Customers → Northwind Logistics" instead of "Customers → CUS-1004".
useBreadcrumbLabel(() => customer.value?.company)

// A missing record is a route-level condition, not a transient failure: this
// URL will never resolve, so the page offers the list instead of "retry".
const isNotFound = computed(() => isNotFoundError(error.value))

/** Figures shown as a compact summary row above the detail panels. */
const stats = computed(() => {
  const record = customer.value
  if (!record) return []
  return [
    { label: t('customers_col_mrr'), value: currency(record.mrr.amount, record.mrr.currency) },
    {
      label: t('customers_lifetime_value'),
      value: currency(record.lifetimeValue.amount, record.lifetimeValue.currency, true),
    },
    { label: t('customers_open_orders'), value: number(record.openOrders) },
    { label: t('customers_since'), value: date(record.since) },
  ]
})
</script>

<template>
  <div class="space-y-6">
    <UiEmptyState
      v-if="isNotFound"
      variant="error"
      icon="search"
      :title="t('customers_not_found_title')"
      :description="t('customers_not_found_body')"
    >
      <UiButton to="/dashboard/customers" variant="primary">
        {{ t('customers_back_to_list') }}
      </UiButton>
    </UiEmptyState>

    <UiEmptyState
      v-else-if="isError"
      variant="error"
      :title="t('common_error_title')"
      :description="t('common_error_body')"
    >
      <UiButton variant="ghost" @click="refetch">{{ t('common_retry') }}</UiButton>
    </UiEmptyState>

    <template v-else-if="isPending">
      <!-- Skeletons mirror the real layout so the page does not reflow when the
           data lands. `aria-busy` is what tells a screen reader to wait. -->
      <div class="space-y-6" aria-busy="true" :aria-label="t('common_loading')">
        <UiSkeleton class="h-10 w-72" />
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <UiSkeleton v-for="index in 4" :key="index" class="h-24" />
        </div>
        <UiSkeleton class="h-64" />
      </div>
    </template>

    <template v-else-if="customer">
      <UiPageHeader :title="customer.company" :description="customer.contactName">
        <template #meta>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <UiBadge :variant="customerStatusVariant(customer.status)" size="sm">
              {{ t(`customers_status_${customer.status}`) }}
            </UiBadge>
            <UiBadge variant="secondary" size="sm">
              {{ t(`customers_plan_${customer.plan}`) }}
            </UiBadge>
          </div>
        </template>
        <template #actions>
          <UiButton to="/dashboard/customers" variant="ghost">
            <span
              :class="[resolveIcon('arrow-left'), 'h-4 w-4 rtl:rotate-180']"
              aria-hidden="true"
            />
            {{ t('customers_back_to_list') }}
          </UiButton>
          <UiButton
            v-if="can('customers:manage')"
            :to="`/dashboard/customers/${customer.id}/edit`"
            variant="primary"
          >
            <span :class="[resolveIcon('edit'), 'h-4 w-4']" aria-hidden="true" />
            {{ t('common_edit') }}
          </UiButton>
        </template>
      </UiPageHeader>

      <!--
        A description list, so "Monthly recurring revenue, $2,490" is announced
        as one unit rather than as two unrelated strings.

        The `<div>` wrapper is load-bearing: a `<dl>` may only directly contain
        `<dt>`/`<dd>` pairs or `<div>` groups. `UiCard` renders its slot inside
        a padding div, so putting the card *between* the `<dl>` and the pair
        buries them two levels deep and axe reports `definition-list` and
        `dlitem` as serious violations. The card goes inside the group instead.
      -->
      <dl class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div
          v-for="stat in stats"
          :key="stat.label"
          class="border-border bg-card rounded-[var(--shape-radius-sm)] border p-4"
        >
          <dt class="text-muted-foreground text-sm">{{ stat.label }}</dt>
          <dd class="text-foreground mt-1 text-xl font-semibold tabular-nums">{{ stat.value }}</dd>
        </div>
      </dl>

      <div class="grid gap-6 lg:grid-cols-3">
        <UiCard class="p-5 lg:col-span-2">
          <h2 class="text-foreground text-base font-semibold">
            {{ t('customers_contact_title') }}
          </h2>
          <dl class="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt class="text-muted-foreground text-xs tracking-wide uppercase">
                {{ t('common_email') }}
              </dt>
              <dd class="mt-1">
                <a
                  :href="`mailto:${customer.email}`"
                  class="text-link hover:text-link-hover break-all hover:underline"
                >
                  {{ customer.email }}
                </a>
              </dd>
            </div>
            <div>
              <dt class="text-muted-foreground text-xs tracking-wide uppercase">
                {{ t('customers_phone') }}
              </dt>
              <dd class="text-foreground mt-1">
                <a :href="`tel:${customer.phone.replace(/\s/g, '')}`" class="hover:underline">
                  {{ customer.phone }}
                </a>
              </dd>
            </div>
            <div>
              <dt class="text-muted-foreground text-xs tracking-wide uppercase">
                {{ t('customers_location') }}
              </dt>
              <dd class="text-foreground mt-1">{{ customer.city }}, {{ customer.country }}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground text-xs tracking-wide uppercase">
                {{ t('customers_owner') }}
              </dt>
              <dd class="text-foreground mt-1">{{ customer.owner }}</dd>
            </div>
          </dl>
        </UiCard>

        <UiCard class="p-5">
          <h2 class="text-foreground text-base font-semibold">{{ t('customers_notes_title') }}</h2>
          <p v-if="customer.notes" class="text-foreground mt-3 text-sm whitespace-pre-line">
            {{ customer.notes }}
          </p>
          <!-- An account with no notes is normal, not a failure — the empty
               state says so plainly instead of rendering a blank box. -->
          <p v-else class="text-muted-foreground mt-3 text-sm">{{ t('customers_notes_empty') }}</p>

          <p class="text-muted-foreground mt-6 text-xs">
            {{ t('customers_last_contact') }}
            <time :datetime="customer.lastContactAt">
              {{ relativeTime(customer.lastContactAt) }}
            </time>
          </p>
        </UiCard>
      </div>
    </template>
  </div>
</template>
