<script setup lang="ts">
/**
 * Billing.
 *
 * The route has no inputs — `/dashboard/billing` means one thing — so this page
 * composes the billing feature directly. What it does *not* do is implement it:
 * the subscribe/cancel workflow and its feedback live in `useBillingActions`,
 * and the quota rules in `presentation.ts`, so an upgrade prompt raised from
 * somewhere else behaves identically.
 */
import { useI18n } from 'vue-i18n'

import { UiPageHeader } from '@/components/ui'
import { useFormatters } from '@/composables/useFormatters'
import type { BillingInterval } from '@/types'
import { resolveIcon } from '~/config/icon-provider'

// Relative, like every other module's pages: the barrel is the module's public
// API for *other* modules, not a way for it to import itself.
import { PLANS } from '../composables/constants'
import { useBillingActions } from '../composables/useBillingActions'
import { useBillingQuery } from '../composables/useBillingQuery'
import { tierAccentClass, usageMetricViews, type UsageMetricId } from '../presentation'

const { t } = useI18n()
const { currency } = useFormatters()

// Destructured, so the template binds to top-level refs and Vue unwraps them.
const { usage, invoices, paymentMethods, isSubscribed, currentTier, isLoading, error, refetch } =
  useBillingQuery()
const { subscribe, cancelSubscription, isSubscribing } = useBillingActions()

const billingInterval = ref<BillingInterval>('monthly')

const USAGE_LABEL_KEY: Record<UsageMetricId, string> = {
  users: 'billing_usage_users',
  storage: 'billing_usage_storage',
  apiCalls: 'billing_usage_api_calls',
}

/** Fill colour by urgency, so the threshold lives in one place. */
const SEVERITY_BAR_CLASS = {
  normal: 'bg-primary-500',
  warning: 'bg-warning-500',
  critical: 'bg-destructive',
} as const

const usageMetrics = computed(() =>
  usageMetricViews(usage.value).map((metric) => ({
    ...metric,
    label: t(USAGE_LABEL_KEY[metric.id]),
    // Storage is measured in GB; the other two are plain counts. Branching on
    // the metric's id rather than on its translated label.
    reading:
      metric.id === 'storage'
        ? `${metric.current.toFixed(1)} / ${metric.limit} GB`
        : `${metric.current.toLocaleString()} / ${metric.unlimited ? '∞' : metric.limit.toLocaleString()}`,
  })),
)

/** Plan prices are whole currency units, not minor units like invoices. */
const formatPrice = (priceUnits: number) => (priceUnits === 0 ? t('common_free') : `$${priceUnits}`)
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-8">
    <UiPageHeader :title="t('billing_title')" :description="t('billing_subtitle')" />

    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-20">
      <span :class="[resolveIcon('refresh'), 'text-primary-500 h-6 w-6 animate-spin']" />
      <span class="text-surface-500 ms-3">{{ t('common_loading') }}</span>
    </div>

    <!-- Error State -->
    <div
      v-else-if="error"
      class="border-danger-200 dark:border-danger-800 bg-destructive-subtle rounded-2xl border p-6 text-center"
    >
      <p class="text-destructive mb-3">{{ error }}</p>
      <button
        class="bg-destructive text-destructive-foreground hover:bg-danger-700 rounded-xl px-4 py-2 text-sm transition"
        @click="refetch()"
      >
        {{ t('common_retry') }}
      </button>
    </div>

    <template v-else>
      <!-- Usage Overview -->
      <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div
          v-for="metric in usageMetrics"
          :key="metric.id"
          class="dark:bg-surface-800/90 border-surface-200 dark:border-surface-700 rounded-2xl border bg-white/90 p-6 shadow-sm"
        >
          <div class="mb-3 flex items-center justify-between">
            <span class="text-muted-foreground text-sm font-semibold">{{ metric.label }}</span>
            <span class="text-muted-foreground text-xs">{{ metric.reading }}</span>
          </div>
          <div class="bg-surface-100 dark:bg-surface-700 h-2.5 w-full overflow-hidden rounded-full">
            <!--
              An unlimited quota has no fill to show, so it gets a token sliver
              rather than a bar that reads as "5% used".
            -->
            <div
              class="h-full rounded-full transition-all duration-500"
              :class="SEVERITY_BAR_CLASS[metric.severity]"
              :style="{ width: `${metric.unlimited ? 5 : metric.percent}%` }"
            />
          </div>
          <p class="text-muted-foreground mt-2 text-xs">
            {{
              metric.unlimited
                ? t('common_unlimited')
                : `${Math.round(metric.percent)}% ${t('common_used')}`
            }}
          </p>
        </div>
      </div>

      <!-- Billing Interval Toggle -->
      <div class="flex items-center justify-center gap-4">
        <span
          :class="[
            'text-sm font-medium',
            billingInterval === 'monthly'
              ? 'text-primary-600 dark:text-primary-400'
              : 'text-surface-500',
          ]"
          >{{ t('billing_monthly') }}</span
        >
        <button
          class="relative h-7 w-14 rounded-full transition-colors"
          :class="
            billingInterval === 'yearly' ? 'bg-primary-500' : 'bg-surface-300 dark:bg-surface-600'
          "
          @click="billingInterval = billingInterval === 'monthly' ? 'yearly' : 'monthly'"
        >
          <span
            class="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform"
            :class="billingInterval === 'yearly' ? 'translate-x-7.5' : 'translate-x-0.5'"
          />
        </button>
        <span
          :class="[
            'text-sm font-medium',
            billingInterval === 'yearly'
              ? 'text-primary-600 dark:text-primary-400'
              : 'text-surface-500',
          ]"
        >
          {{ t('billing_yearly') }}
          <span class="text-success-600 dark:text-success-400 ms-1 text-xs font-bold">{{
            t('billing_save_pct')
          }}</span>
        </span>
      </div>

      <!-- Pricing Cards -->
      <div v-if="PLANS.length" class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <div
          v-for="plan in PLANS"
          :key="plan.id"
          :class="[
            'dark:bg-surface-800/90 hover:shadow-elevated relative flex flex-col rounded-2xl border bg-white/90 p-6 shadow-sm transition-all duration-300 hover:-translate-y-1',
            plan.highlighted
              ? 'border-primary-500 dark:border-primary-400 ring-primary-500/20 ring-2'
              : 'border-surface-200 dark:border-surface-700',
          ]"
        >
          <div v-if="plan.highlighted" class="absolute -top-3 left-1/2 -translate-x-1/2">
            <span class="bg-primary-500 rounded-full px-3 py-1 text-xs font-bold text-white">{{
              t('billing_most_popular')
            }}</span>
          </div>
          <div
            :class="[
              'mb-4 flex h-10 w-10 items-center justify-center rounded-xl text-white',
              tierAccentClass(plan.tier),
            ]"
          >
            <span :class="[resolveIcon('star'), 'h-5 w-5']" />
          </div>
          <h3 class="text-surface-900 text-lg font-bold dark:text-white">{{ plan.name }}</h3>
          <p class="text-muted-foreground mt-1 mb-4 text-sm">
            {{ plan.description }}
          </p>
          <div class="mb-6">
            <span class="text-surface-900 text-4xl font-black dark:text-white">
              {{ formatPrice(plan.price[billingInterval]) }}
            </span>
            <span v-if="plan.price[billingInterval] > 0" class="text-muted-foreground text-sm"
              >/{{
                billingInterval === 'yearly' ? t('billing_per_year') : t('billing_per_month')
              }}</span
            >
          </div>
          <ul class="mb-6 flex-1 space-y-2.5">
            <li
              v-for="feature in plan.features"
              :key="feature"
              class="text-muted-foreground flex items-start gap-2 text-sm"
            >
              <span
                :class="[
                  resolveIcon('check-circle'),
                  'text-success-600 dark:text-success-400 mt-0.5 h-4 w-4 shrink-0',
                ]"
              />
              {{ feature }}
            </li>
          </ul>
          <button
            :disabled="isSubscribing"
            :class="[
              'w-full rounded-xl py-2.5 text-sm font-semibold transition-all',
              plan.highlighted
                ? 'bg-primary-600 hover:bg-primary-500 text-white shadow-md'
                : 'border-surface-200 dark:border-surface-700 text-foreground hover:bg-surface-100 dark:hover:bg-surface-800 border',
            ]"
            @click="subscribe(plan.id, billingInterval)"
          >
            {{ plan.tier === currentTier ? t('billing_current_plan') : t('billing_upgrade') }}
          </button>
        </div>
      </div>

      <!-- Payment Methods & Invoices -->
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <!-- Payment Methods -->
        <div
          class="dark:bg-surface-800/90 border-surface-200 dark:border-surface-700 rounded-2xl border bg-white/90 p-6 shadow-sm"
        >
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-surface-900 text-lg font-bold dark:text-white">
              {{ t('billing_payment_methods') }}
            </h2>
            <button class="text-primary-600 hover:text-primary-500 text-sm font-medium">
              {{ t('billing_add_card') }}
            </button>
          </div>
          <div class="space-y-3">
            <div
              v-for="pm in paymentMethods"
              :key="pm.id"
              :class="[
                'flex items-center justify-between rounded-xl border p-4 transition-colors',
                pm.isDefault
                  ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-900/10'
                  : 'border-surface-200 dark:border-surface-700',
              ]"
            >
              <div class="flex items-center gap-3">
                <div
                  class="bg-surface-100 dark:bg-surface-700 text-surface-500 flex h-7 w-10 items-center justify-center rounded text-xs font-bold"
                >
                  {{ pm.brand ?? t('billing_card') }}
                </div>
                <div>
                  <p class="text-surface-900 text-sm font-medium dark:text-white">
                    •••• {{ pm.last4 }}
                  </p>
                  <p v-if="pm.expiryMonth" class="text-muted-foreground text-xs">
                    {{ t('billing_expires') }} {{ pm.expiryMonth }}/{{ pm.expiryYear }}
                  </p>
                </div>
              </div>
              <span
                v-if="pm.isDefault"
                class="text-primary-600 dark:text-primary-400 bg-primary-100 dark:bg-primary-900/30 rounded-full px-2 py-0.5 text-xs font-semibold"
                >{{ t('billing_default') }}</span
              >
            </div>
          </div>
        </div>

        <!-- Invoices -->
        <div
          class="dark:bg-surface-800/90 border-surface-200 dark:border-surface-700 rounded-2xl border bg-white/90 p-6 shadow-sm"
        >
          <h2 class="text-surface-900 mb-4 text-lg font-bold dark:text-white">
            {{ t('billing_recent_invoices') }}
          </h2>
          <div class="space-y-3">
            <div
              v-for="invoice in invoices"
              :key="invoice.id"
              class="border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-800/50 flex items-center justify-between rounded-xl border p-3 transition-colors"
            >
              <div class="flex items-center gap-3">
                <span :class="[resolveIcon('file'), 'text-muted-foreground h-5 w-5']" />
                <div>
                  <p class="text-surface-900 text-sm font-medium dark:text-white">
                    {{ invoice.number }}
                  </p>
                  <p class="text-muted-foreground text-xs">
                    {{ invoice.periodStart }} — {{ invoice.periodEnd }}
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <span
                  :class="[
                    'rounded-full px-2 py-0.5 text-xs font-semibold',
                    invoice.status === 'paid'
                      ? 'bg-success-100 text-success-800 dark:bg-success-900/30 dark:text-success-200'
                      : invoice.status === 'open'
                        ? 'bg-warning-100 text-warning-800 dark:bg-warning-900/30 dark:text-warning-200'
                        : 'bg-surface-100 text-surface-500 dark:bg-surface-700',
                  ]"
                  >{{ invoice.status }}</span
                >
                <!-- The invoice carries its own currency; formatting it as a
                     hardcoded "$" was wrong for every other one. -->
                <span class="text-surface-900 text-sm font-semibold tabular-nums dark:text-white">{{
                  currency(invoice.amount, invoice.currency)
                }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Cancel Subscription -->
      <div
        v-if="isSubscribed"
        class="border-danger-200 dark:border-danger-800/40 bg-destructive-subtle flex items-center justify-between rounded-2xl border p-6"
      >
        <div>
          <h3 class="text-danger-800 dark:text-danger-200 text-lg font-bold">
            {{ t('billing_cancel_title') }}
          </h3>
          <p class="text-danger-700/80 dark:text-danger-300/80 mt-1 text-sm">
            {{ t('billing_cancel_text') }}
          </p>
        </div>
        <button
          class="border-danger-300 dark:border-danger-700 text-destructive hover:bg-danger-100 dark:hover:bg-danger-900/20 rounded-xl border px-4 py-2 text-sm font-medium transition-colors"
          @click="cancelSubscription"
        >
          {{ t('billing_cancel_plan') }}
        </button>
      </div>
    </template>
  </div>
</template>
