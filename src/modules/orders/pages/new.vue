<script setup lang="ts">
/**
 * Route adapter for `/dashboard/orders/new`.
 *
 * The route takes no input, so this page's only job is the half of "create an
 * order" that is genuinely about routing: where the user lands once the order
 * exists. The form, its steps, its validation and its pricing preview belong to
 * the orders feature.
 */
import { useI18n } from 'vue-i18n'

import { UiButton, UiPageHeader } from '@/components/ui'

import OrderDraftForm from '../components/OrderDraftForm.vue'
import type { Order } from '../types'

const { t } = useI18n()
const router = useRouter()

async function onCreated(order: Order) {
  await router.push(`/dashboard/orders/${order.id}`)
}
</script>

<template>
  <div class="space-y-6">
    <UiPageHeader :title="t('orders_new_title')" :description="t('orders_new_subtitle')">
      <template #actions>
        <UiButton to="/dashboard/orders" variant="ghost">{{ t('common_cancel') }}</UiButton>
      </template>
    </UiPageHeader>

    <OrderDraftForm @created="onCreated" />
  </div>
</template>
