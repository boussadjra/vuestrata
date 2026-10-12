/**
 * The customer form's workflow: what it starts from, and what saving does.
 *
 * `pages/form.vue` only lays the fields out and decides where to go next. The
 * mutation, the choice between create and update, and the confirmation toast
 * are the feature's, so they live here, where a second screen that edits a
 * customer (a drawer, an import review) can use them too.
 *
 * `save` is the `UiForm` action. It lets a failure reject: `UiForm` catches it,
 * puts the server's messages on the fields they are about, and shows the rest
 * above the submit button. Nothing here handles an error.
 */
import type { Ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useNotificationStore } from '@/stores/notification'

import {
  CUSTOMER_PLANS,
  CUSTOMER_STATUSES,
  customerDraftSchema,
  type Customer,
  type CustomerDraft,
} from '../types'
import {
  useCreateCustomerMutation,
  useCustomerQuery,
  useUpdateCustomerMutation,
} from './useCustomers'

/** What a new customer starts as. Text starts empty, so emptying a box again is not a change. */
const NEW_CUSTOMER: CustomerDraft = {
  company: '',
  contactName: '',
  email: '',
  phone: '',
  status: 'prospect',
  plan: 'starter',
  city: '',
  country: 'US',
  notes: '',
}

/** `id` is the record being edited, or `undefined` for a new one. */
export function useCustomerForm(id: Ref<string | undefined>) {
  const { t } = useI18n()
  const notifications = useNotificationStore()

  const isEdit = computed(() => Boolean(id.value))

  // Idle while `id` is undefined, so the create route requests nothing.
  const { item: existing, isPending } = useCustomerQuery(id)
  const isLoading = computed(() => isEdit.value && isPending.value)

  const createMutation = useCreateCustomerMutation()
  const updateMutation = useUpdateCustomerMutation()

  /**
   * `undefined` until the record arrives, so the form is not mounted with blank
   * values and then re-seeded: a form takes its `initialValues` when it mounts.
   */
  const initialValues = computed<CustomerDraft | undefined>(() => {
    if (!isEdit.value) return NEW_CUSTOMER
    const record = existing.value
    if (!record) return undefined
    return {
      company: record.company,
      contactName: record.contactName,
      email: record.email,
      phone: record.phone,
      status: record.status,
      plan: record.plan,
      city: record.city,
      country: record.country,
      notes: record.notes,
    }
  })

  // Rebuilt when the locale changes.
  const statusOptions = computed(() =>
    CUSTOMER_STATUSES.map((value) => ({ label: t(`customers_status_${value}`), value })),
  )
  const planOptions = computed(() =>
    CUSTOMER_PLANS.map((value) => ({ label: t(`customers_plan_${value}`), value })),
  )

  /** Create or update, then confirm. Resolves with the saved record. */
  async function save(values: Record<string, unknown>): Promise<Customer> {
    // The form has already validated against this schema; parsing again is
    // what turns `Record<string, unknown>` into a typed, trimmed draft.
    const draft = customerDraftSchema.parse(values)
    const editing = id.value

    const saved = editing
      ? await updateMutation.mutateAsync({ id: editing, patch: draft })
      : await createMutation.mutateAsync(draft)

    notifications.add({
      type: 'success',
      message: editing ? t('customers_saved') : t('customers_created'),
    })
    return saved
  }

  return {
    /** The same schema the backend validates a draft against. */
    schema: customerDraftSchema,
    isEdit,
    isLoading,
    initialValues,
    statusOptions,
    planOptions,
    save,
  }
}
