<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { useNotificationStore } from '@/stores/notification'
import type { BillingInterval, PlanTier } from '@/types'
import { resolveIcon } from '~/config/icon-provider'
import { useBilling, PLANS } from '~/modules/billing'

const { t } = useI18n()

const billing = useBilling()
const notifications = useNotificationStore()
const billingInterval = ref<BillingInterval>('monthly')

const tierColors: Record<PlanTier, string> = {
  free: 'bg-surface-400',
  starter: 'bg-accent-500',
  pro: 'bg-primary-500',
  enterprise: 'bg-secondary-500',
}

const formatCurrency = (amountCents: number) => `$${(amountCents / 100).toFixed(2)}`
const formatPrice = (priceDollars: number) =>
  priceDollars === 0 ? t('common_free') : `$${priceDollars}`

async function handleSubscribe(planId: string) {
  // The mutation's own pending state (exposed as `billing.isSubscribing`) is
  // already the source of truth — no parallel local ref needed.
  try {
    await billing.subscribe(planId, billingInterval.value)
    notifications.add({
      type: 'success',
      title: t('billing_subscribed'),
      message: t('billing_plan_updated'),
    })
  } catch {
    notifications.add({
      type: 'error',
      title: t('billing_error'),
      message: t('billing_error_update'),
    })
  }
}

async function handleCancel() {
  try {
    await billing.cancelSubscription()
    notifications.add({
      type: 'info',
      title: t('billing_canceled'),
      message: t('billing_cancel_msg'),
    })
  } catch {
    notifications.add({
      type: 'error',
      title: t('billing_error'),
      message: t('billing_error_cancel'),
    })
  }
}

const usagePercent = (current: number, limit: number) =>
  limit <= 0 ? 0 : Math.min((current / limit) * 100, 100)
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-8">
    <!-- Header -->
    <div>
      <h1 class="text-surface-900 text-3xl font-extrabold tracking-tight dark:text-white">
        {{ t('billing_title') }}
      </h1>
      <p class="text-surface-500 dark:text-surface-400 mt-1">{{ t('billing_subtitle') }}</p>
    </div>

    <!-- Loading State -->
    <div v-if="billing.isLoading" class="flex items-center justify-center py-20">
      <span :class="[resolveIcon('refresh'), 'text-primary-500 h-6 w-6 animate-spin']" />
      <span class="text-surface-500 ml-3">{{ t('common_loading') }}</span>
    </div>

    <!-- Error State -->
    <div
      v-else-if="billing.error"
      class="rounded-2xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-950/20"
    >
      <p class="mb-3 text-red-600 dark:text-red-400">{{ billing.error }}</p>
      <button
        class="rounded-xl bg-red-600 px-4 py-2 text-sm text-white transition hover:bg-red-500"
        @click="billing.fetchBillingData()"
      >
        {{ t('common_retry') }}
      </button>
    </div>

    <template v-else>
      <!-- Usage Overview -->
      <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div
          v-for="(metric, key) in {
            [t('billing_usage_users')]: billing.usage.users,
            [t('billing_usage_storage')]: billing.usage.storage,
            [t('billing_usage_api_calls')]: billing.usage.apiCalls,
          }"
          :key="key"
          class="dark:bg-surface-800/90 border-surface-200 dark:border-surface-700 rounded-2xl border bg-white/90 p-6 shadow-sm"
        >
          <div class="mb-3 flex items-center justify-between">
            <span class="text-surface-600 dark:text-surface-300 text-sm font-semibold">{{
              key
            }}</span>
            <span class="text-surface-400 text-xs">
              {{
                key === 'Storage'
                  ? `${metric.current.toFixed(1)} / ${metric.limit} GB`
                  : `${metric.current.toLocaleString()} / ${metric.limit < 0 ? '∞' : metric.limit.toLocaleString()}`
              }}
            </span>
          </div>
          <div class="bg-surface-100 dark:bg-surface-700 h-2.5 w-full overflow-hidden rounded-full">
            <div
              class="h-full rounded-full transition-all duration-500"
              :class="
                usagePercent(metric.current, metric.limit) > 80
                  ? 'bg-red-500'
                  : usagePercent(metric.current, metric.limit) > 60
                    ? 'bg-yellow-500'
                    : 'bg-primary-500'
              "
              :style="{
                width: `${metric.limit < 0 ? 5 : usagePercent(metric.current, metric.limit)}%`,
              }"
            />
          </div>
          <p class="text-surface-400 mt-2 text-xs">
            {{
              metric.limit < 0
                ? t('common_unlimited')
                : `${Math.round(usagePercent(metric.current, metric.limit))}% ${t('common_used')}`
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
          <span class="ml-1 text-xs font-bold text-green-500">{{ t('billing_save_pct') }}</span>
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
              tierColors[plan.tier],
            ]"
          >
            <span :class="[resolveIcon('star'), 'h-5 w-5']" />
          </div>
          <h3 class="text-surface-900 text-lg font-bold dark:text-white">{{ plan.name }}</h3>
          <p class="text-surface-500 dark:text-surface-400 mt-1 mb-4 text-sm">
            {{ plan.description }}
          </p>
          <div class="mb-6">
            <span class="text-surface-900 text-4xl font-black dark:text-white">
              {{ formatPrice(plan.price[billingInterval]) }}
            </span>
            <span v-if="plan.price[billingInterval] > 0" class="text-surface-400 text-sm"
              >/{{
                billingInterval === 'yearly' ? t('billing_per_year') : t('billing_per_month')
              }}</span
            >
          </div>
          <ul class="mb-6 flex-1 space-y-2.5">
            <li
              v-for="feature in plan.features"
              :key="feature"
              class="text-surface-600 dark:text-surface-300 flex items-start gap-2 text-sm"
            >
              <span
                :class="[resolveIcon('check-circle'), 'mt-0.5 h-4 w-4 shrink-0 text-green-500']"
              />
              {{ feature }}
            </li>
          </ul>
          <button
            :disabled="billing.isSubscribing"
            :class="[
              'w-full rounded-xl py-2.5 text-sm font-semibold transition-all',
              plan.highlighted
                ? 'bg-primary-600 hover:bg-primary-500 text-white shadow-md'
                : 'border-surface-200 dark:border-surface-700 text-surface-700 dark:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-800 border',
            ]"
            @click="handleSubscribe(plan.id)"
          >
            {{
              plan.tier === billing.currentTier ? t('billing_current_plan') : t('billing_upgrade')
            }}
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
              v-for="pm in billing.paymentMethods"
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
                  <p v-if="pm.expiryMonth" class="text-surface-400 text-xs">
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
              v-for="invoice in billing.invoices"
              :key="invoice.id"
              class="border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-800/50 flex items-center justify-between rounded-xl border p-3 transition-colors"
            >
              <div class="flex items-center gap-3">
                <span :class="[resolveIcon('file'), 'text-surface-400 h-5 w-5']" />
                <div>
                  <p class="text-surface-900 text-sm font-medium dark:text-white">
                    {{ invoice.number }}
                  </p>
                  <p class="text-surface-400 text-xs">
                    {{ invoice.periodStart }} — {{ invoice.periodEnd }}
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <span
                  :class="[
                    'rounded-full px-2 py-0.5 text-xs font-semibold',
                    invoice.status === 'paid'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : invoice.status === 'open'
                        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                        : 'bg-surface-100 text-surface-500 dark:bg-surface-700',
                  ]"
                  >{{ invoice.status }}</span
                >
                <span class="text-surface-900 text-sm font-semibold tabular-nums dark:text-white">{{
                  formatCurrency(invoice.amount)
                }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Cancel Subscription -->
      <div
        v-if="billing.isSubscribed"
        class="flex items-center justify-between rounded-2xl border border-red-200 bg-red-50 p-6 dark:border-red-800/40 dark:bg-red-900/10"
      >
        <div>
          <h3 class="text-lg font-bold text-red-700 dark:text-red-400">
            {{ t('billing_cancel_title') }}
          </h3>
          <p class="mt-1 text-sm text-red-600/70 dark:text-red-400/70">
            {{ t('billing_cancel_text') }}
          </p>
        </div>
        <button
          class="rounded-xl border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
          @click="handleCancel"
        >
          {{ t('billing_cancel_plan') }}
        </button>
      </div>
    </template>
  </div>
</template>
