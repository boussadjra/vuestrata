/**
 * Subscription actions, with the feedback that belongs to them.
 *
 * Which toast a failed cancellation raises is part of the billing workflow, not
 * of the URL that happened to trigger it. Keeping it here means a second entry
 * point — an upgrade prompt in a dialog, say — cannot quietly report a failure
 * differently from the billing page.
 *
 * The mutations' own pending flags stay the source of truth; there is no
 * parallel local `isSaving` to drift from them.
 */
import { useI18n } from 'vue-i18n'

import { useNotificationStore } from '~/stores/notification'
import type { BillingInterval } from '~/types'

import { useCancelSubscriptionMutation } from './useCancelSubscriptionMutation'
import { useSubscribeMutation } from './useSubscribeMutation'

export function useBillingActions() {
  const { t } = useI18n()
  const notifications = useNotificationStore()

  const { subscribe: runSubscribe, isPending: isSubscribing } = useSubscribeMutation()
  const { cancel: runCancel, isPending: isCanceling } = useCancelSubscriptionMutation()

  async function subscribe(planId: string, interval: BillingInterval): Promise<boolean> {
    try {
      await runSubscribe(planId, interval)
      notifications.add({
        type: 'success',
        title: t('billing_subscribed'),
        message: t('billing_plan_updated'),
      })
      return true
    } catch {
      notifications.add({
        type: 'error',
        title: t('billing_error'),
        message: t('billing_error_update'),
      })
      return false
    }
  }

  async function cancelSubscription(): Promise<boolean> {
    try {
      await runCancel()
      notifications.add({
        type: 'info',
        title: t('billing_canceled'),
        message: t('billing_cancel_msg'),
      })
      return true
    } catch {
      notifications.add({
        type: 'error',
        title: t('billing_error'),
        message: t('billing_error_cancel'),
      })
      return false
    }
  }

  return { subscribe, cancelSubscription, isSubscribing, isCanceling }
}
