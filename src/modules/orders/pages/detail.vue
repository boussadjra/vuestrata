<script setup lang="ts">
/**
 * Order detail.
 *
 * The line items are a real `<table>` with a `<tfoot>` carrying the totals.
 * A screen-reader user reading "Subtotal $412.00" gets it associated with the
 * table it belongs to, and the arithmetic is visible rather than asserted:
 * quantity × unit price, then subtotal, shipping, tax, total.
 */
import { useI18n } from 'vue-i18n'

import { UiBadge, UiButton, UiCard, UiEmptyState, UiPageHeader, UiSkeleton } from '@/components/ui'
import { useBreadcrumbLabel } from '@/composables/useBreadcrumbs'
import { useFormatters } from '@/composables/useFormatters'
import { useRouteParam } from '@/composables/useRouteParam'
import { resolveIcon } from '@/config/icon-provider'

import { useOrderQuery } from '../composables/useOrders'
import type { OrderStatus } from '../types'

const { t } = useI18n()
const { currency, dateTime, number } = useFormatters()

const id = useRouteParam('id')
const { item: order, isPending, isError, error, refetch } = useOrderQuery(id)

useBreadcrumbLabel(() => order.value?.reference)

const isNotFound = computed(() => {
  const failure = (error.value as { status?: number; statusCode?: number } | null) ?? null
  return failure?.status === 404 || failure?.statusCode === 404
})

const STATUS_VARIANT: Record<OrderStatus, 'success' | 'warning' | 'error' | 'default' | 'primary'> =
  {
    draft: 'default',
    pending: 'warning',
    paid: 'primary',
    fulfilled: 'success',
    cancelled: 'error',
    refunded: 'error',
  }

const totals = computed(() => {
  const record = order.value
  if (!record) return []
  return [
    { label: t('orders_subtotal'), value: record.subtotal, emphasis: false },
    { label: t('orders_shipping'), value: record.shipping, emphasis: false },
    { label: t('orders_tax'), value: record.tax, emphasis: false },
    { label: t('common_total'), value: record.total, emphasis: true },
  ]
})
</script>

<template>
  <div class="space-y-6">
    <UiEmptyState
      v-if="isNotFound"
      variant="error"
      icon="search"
      :title="t('orders_not_found_title')"
      :description="t('orders_not_found_body')"
    >
      <UiButton to="/dashboard/orders" variant="primary">{{ t('orders_back_to_list') }}</UiButton>
    </UiEmptyState>

    <UiEmptyState
      v-else-if="isError"
      variant="error"
      :title="t('common_error_title')"
      :description="t('common_error_body')"
    >
      <UiButton variant="ghost" @click="refetch">{{ t('common_retry') }}</UiButton>
    </UiEmptyState>

    <div v-else-if="isPending" class="space-y-6" aria-busy="true" :aria-label="t('common_loading')">
      <UiSkeleton class="h-10 w-64" />
      <UiSkeleton class="h-72" />
    </div>

    <template v-else-if="order">
      <UiPageHeader :title="order.reference" :description="order.customerName">
        <template #meta>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <UiBadge :variant="STATUS_VARIANT[order.status]" size="sm">
              {{ t(`orders_status_${order.status}`) }}
            </UiBadge>
            <UiBadge variant="secondary" size="sm">
              {{ t(`orders_channel_${order.channel}`) }}
            </UiBadge>
          </div>
        </template>
        <template #actions>
          <UiButton to="/dashboard/orders" variant="ghost">
            <span
              :class="[resolveIcon('arrow-left'), 'h-4 w-4 rtl:rotate-180']"
              aria-hidden="true"
            />
            {{ t('orders_back_to_list') }}
          </UiButton>
          <UiButton :to="`/dashboard/customers/${order.customerId}`" variant="ghost">
            <span :class="[resolveIcon('users'), 'h-4 w-4']" aria-hidden="true" />
            {{ t('orders_view_customer') }}
          </UiButton>
        </template>
      </UiPageHeader>

      <div class="grid gap-6 lg:grid-cols-3">
        <UiCard class="overflow-hidden lg:col-span-2">
          <h2 class="text-foreground border-border border-b p-5 text-base font-semibold">
            {{ t('orders_lines_title') }}
          </h2>

          <div
            class="overflow-x-auto"
            tabindex="0"
            role="region"
            :aria-label="t('orders_lines_title')"
          >
            <table class="w-full text-sm">
              <caption class="sr-only">
                {{
                  t('orders_lines_title')
                }}
              </caption>
              <thead>
                <tr class="border-border border-b">
                  <th scope="col" class="text-muted-foreground px-5 py-2 text-start font-medium">
                    {{ t('orders_col_item') }}
                  </th>
                  <th scope="col" class="text-muted-foreground px-5 py-2 text-end font-medium">
                    {{ t('common_quantity') }}
                  </th>
                  <th scope="col" class="text-muted-foreground px-5 py-2 text-end font-medium">
                    {{ t('orders_unit_price') }}
                  </th>
                  <th scope="col" class="text-muted-foreground px-5 py-2 text-end font-medium">
                    {{ t('common_total') }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="line in order.lines" :key="line.sku" class="border-border border-b">
                  <th scope="row" class="px-5 py-3 text-start font-normal">
                    <span class="text-foreground block font-medium">{{ line.name }}</span>
                    <span class="text-muted-foreground block font-mono text-xs">{{
                      line.sku
                    }}</span>
                  </th>
                  <td class="text-foreground px-5 py-3 text-end tabular-nums">
                    {{ number(line.quantity) }}
                  </td>
                  <td class="text-muted-foreground px-5 py-3 text-end tabular-nums">
                    {{ currency(line.unitPrice.amount, line.unitPrice.currency) }}
                  </td>
                  <td class="text-foreground px-5 py-3 text-end tabular-nums">
                    {{ currency(line.quantity * line.unitPrice.amount, line.unitPrice.currency) }}
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr v-for="total in totals" :key="total.label">
                  <td
                    colspan="3"
                    :class="[
                      'px-5 py-2 text-end',
                      total.emphasis ? 'text-foreground font-semibold' : 'text-muted-foreground',
                    ]"
                  >
                    {{ total.label }}
                  </td>
                  <td
                    :class="[
                      'px-5 py-2 text-end tabular-nums',
                      total.emphasis ? 'text-foreground font-semibold' : 'text-foreground',
                    ]"
                  >
                    {{ currency(total.value.amount, total.value.currency) }}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </UiCard>

        <UiCard class="p-5">
          <h2 class="text-foreground text-base font-semibold">{{ t('orders_shipping_title') }}</h2>
          <dl class="mt-4 space-y-4 text-sm">
            <div>
              <dt class="text-muted-foreground text-xs tracking-wide uppercase">
                {{ t('customers_location') }}
              </dt>
              <dd class="text-foreground mt-1">
                {{ order.shippingCity }}, {{ order.shippingCountry }}
              </dd>
            </div>
            <div>
              <dt class="text-muted-foreground text-xs tracking-wide uppercase">
                {{ t('orders_col_placed') }}
              </dt>
              <dd class="text-foreground mt-1">
                <time :datetime="order.placedAt">{{ dateTime(order.placedAt) }}</time>
              </dd>
            </div>
            <div>
              <dt class="text-muted-foreground text-xs tracking-wide uppercase">
                {{ t('orders_fulfilled_at') }}
              </dt>
              <!-- An unfulfilled order has no date. Saying so beats an em dash
                   the reader has to interpret. -->
              <dd class="text-foreground mt-1">
                <time v-if="order.fulfilledAt" :datetime="order.fulfilledAt">
                  {{ dateTime(order.fulfilledAt) }}
                </time>
                <span v-else class="text-muted-foreground">{{ t('orders_not_fulfilled') }}</span>
              </dd>
            </div>
          </dl>
        </UiCard>
      </div>
    </template>
  </div>
</template>
