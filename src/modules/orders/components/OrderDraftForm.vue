<script setup lang="ts">
/**
 * New order — the multi-step form.
 *
 * Owns the fields, the per-step validation, the line repeater and the
 * submission. What it deliberately does not own is where the user goes
 * afterwards: it emits the created order and lets the route decide, so the same
 * form works in a drawer or a wizard that continues somewhere else.
 */
import { useI18n } from 'vue-i18n'

import {
  UiAlert,
  UiButton,
  UiCard,
  UiNumberField,
  UiSelect,
  UiStepper,
  UiTextField,
  UiTextarea,
} from '@/components/ui'
import { useFormatters } from '@/composables/useFormatters'
import { resolveIcon } from '@/config/icon-provider'
import { useNotificationStore } from '@/stores/notification'
import type { StepperItem } from '@/types'

import { useOrderDraft } from '../composables/useOrderDraft'
import { ORDER_CATALOG } from '../pricing'
import { ORDER_CHANNELS, type Order } from '../types'

const emit = defineEmits<{ created: [order: Order] }>()

const { t } = useI18n()
const { currency } = useFormatters()
const notifications = useNotificationStore()

const {
  step,
  stepErrors,
  isFirstStep,
  isLastStep,
  customerId,
  customerName,
  channel,
  shippingCity,
  shippingCountry,
  notes,
  lines,
  selectedSku,
  selectedQuantity,
  pricing,
  addLine,
  removeLine,
  next,
  previous,
  submit,
  isSubmitting,
  submitError,
} = useOrderDraft()

const steps = computed<StepperItem[]>(() => [
  { label: t('orders_step_customer'), description: t('orders_step_customer_desc') },
  { label: t('orders_step_items'), description: t('orders_step_items_desc') },
  { label: t('orders_step_review'), description: t('orders_step_review_desc') },
])

const catalogOptions = ORDER_CATALOG.map((product) => ({
  label: `${product.name} — ${product.sku}`,
  value: product.sku,
}))

const channelOptions = computed(() =>
  ORDER_CHANNELS.map((value) => ({ label: t(`orders_channel_${value}`), value })),
)

async function onSubmit() {
  const order = await submit()
  if (!order) return

  notifications.add({
    type: 'success',
    message: t('orders_created', { reference: order.reference }),
  })
  emit('created', order)
}
</script>

<template>
  <UiCard class="max-w-4xl space-y-6 p-5">
    <UiStepper v-model="step" :steps="steps" />

    <!--
      `role="alert"` so the failure is announced the moment it appears — a
      keyboard user who pressed "Next" and stayed on the same step otherwise
      gets no feedback at all about why.
    -->
    <UiAlert v-if="stepErrors.length" variant="error" :title="t('orders_step_invalid')">
      <ul class="list-inside list-disc space-y-1">
        <li v-for="message in stepErrors" :key="message">{{ message }}</li>
      </ul>
    </UiAlert>

    <UiAlert v-if="submitError" variant="error" :title="t('common_error_title')">
      {{ submitError.message }}
    </UiAlert>

    <!-- Step 1 — customer and destination -->
    <section v-show="step === 0" :aria-label="t('orders_step_customer')" class="space-y-4">
      <div class="grid gap-4 sm:grid-cols-2">
        <UiTextField v-model="customerId" :label="t('orders_customer_id')" required />
        <UiTextField v-model="customerName" :label="t('orders_customer_name')" required />
        <UiSelect v-model="channel" :label="t('orders_col_channel')" :options="channelOptions" />
        <UiTextField v-model="shippingCity" :label="t('customers_city')" required />
        <UiTextField v-model="shippingCountry" :label="t('customers_country')" required />
      </div>
    </section>

    <!-- Step 2 — line items -->
    <section v-show="step === 1" :aria-label="t('orders_step_items')" class="space-y-4">
      <div class="flex flex-wrap items-end gap-3">
        <UiSelect
          v-model="selectedSku"
          class="min-w-64 grow"
          :label="t('orders_add_product')"
          :options="catalogOptions"
        />
        <UiNumberField
          v-model="selectedQuantity"
          class="w-32"
          :label="t('common_quantity')"
          :min="1"
        />
        <UiButton variant="secondary" @click="addLine">
          <span :class="[resolveIcon('document-add'), 'h-4 w-4']" aria-hidden="true" />
          {{ t('common_add') }}
        </UiButton>
      </div>

      <p v-if="lines.length === 0" class="text-muted-foreground text-sm">
        {{ t('orders_no_lines') }}
      </p>

      <table v-else class="w-full text-sm">
        <caption class="sr-only">
          {{
            t('orders_lines_title')
          }}
        </caption>
        <thead>
          <tr class="border-border border-b">
            <th scope="col" class="text-muted-foreground py-2 text-start font-medium">
              {{ t('orders_col_item') }}
            </th>
            <th scope="col" class="text-muted-foreground py-2 text-end font-medium">
              {{ t('common_quantity') }}
            </th>
            <th scope="col" class="text-muted-foreground py-2 text-end font-medium">
              {{ t('common_total') }}
            </th>
            <th scope="col" class="sr-only">{{ t('common_actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="line in lines" :key="line.sku" class="border-border border-b">
            <th scope="row" class="py-2 text-start font-normal">
              <span class="text-foreground block font-medium">{{ line.name }}</span>
              <span class="text-muted-foreground block font-mono text-xs">{{ line.sku }}</span>
            </th>
            <td class="py-2 text-end tabular-nums">{{ line.quantity }}</td>
            <td class="py-2 text-end tabular-nums">
              {{ currency(line.quantity * line.unitPrice.amount, line.unitPrice.currency) }}
            </td>
            <td class="py-2 text-end">
              <!-- The label names the row. "Remove" alone gives a screen
                   reader eight identical buttons. -->
              <UiButton
                variant="ghost"
                size="sm"
                icon
                :aria-label="t('orders_remove_line', { name: line.name })"
                @click="removeLine(line.sku)"
              >
                <span :class="[resolveIcon('close-circle'), 'h-4 w-4']" aria-hidden="true" />
              </UiButton>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Step 3 — review -->
    <section v-show="step === 2" :aria-label="t('orders_step_review')" class="space-y-4">
      <dl class="grid gap-4 sm:grid-cols-2">
        <div>
          <dt class="text-muted-foreground text-xs tracking-wide uppercase">
            {{ t('orders_customer_name') }}
          </dt>
          <dd class="text-foreground mt-1">{{ customerName }} ({{ customerId }})</dd>
        </div>
        <div>
          <dt class="text-muted-foreground text-xs tracking-wide uppercase">
            {{ t('customers_location') }}
          </dt>
          <dd class="text-foreground mt-1">{{ shippingCity }}, {{ shippingCountry }}</dd>
        </div>
      </dl>

      <UiTextarea v-model="notes" :label="t('orders_notes')" :rows="3" />

      <!--
        The totals are computed with the same `priceOrder` the server uses, so
        the figure reviewed here is the figure charged. Showing a
        separately-calculated estimate is how a review step ends up lying.
      -->
      <dl class="border-border space-y-1 border-t pt-4 text-sm">
        <div class="flex justify-between">
          <dt class="text-muted-foreground">{{ t('orders_subtotal') }}</dt>
          <dd class="tabular-nums">
            {{ currency(pricing.subtotal.amount, pricing.subtotal.currency) }}
          </dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-muted-foreground">{{ t('orders_shipping') }}</dt>
          <dd class="tabular-nums">
            {{ currency(pricing.shipping.amount, pricing.shipping.currency) }}
          </dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-muted-foreground">{{ t('orders_tax') }}</dt>
          <dd class="tabular-nums">{{ currency(pricing.tax.amount, pricing.tax.currency) }}</dd>
        </div>
        <div class="text-foreground flex justify-between text-base font-semibold">
          <dt>{{ t('common_total') }}</dt>
          <dd class="tabular-nums">
            {{ currency(pricing.total.amount, pricing.total.currency) }}
          </dd>
        </div>
      </dl>
    </section>

    <div class="border-border flex items-center justify-between border-t pt-4">
      <UiButton variant="ghost" :disabled="isFirstStep" @click="previous">
        {{ t('common_previous') }}
      </UiButton>
      <UiButton v-if="!isLastStep" variant="primary" @click="next">{{ t('common_next') }}</UiButton>
      <UiButton
        v-else
        variant="primary"
        :loading="isSubmitting"
        :disabled="isSubmitting"
        @click="onSubmit"
      >
        {{ t('orders_place') }}
      </UiButton>
    </div>
  </UiCard>
</template>
