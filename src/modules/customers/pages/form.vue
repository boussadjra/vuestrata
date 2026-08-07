<script setup lang="ts">
/**
 * Create / edit a customer — the single-form pattern.
 *
 * One component serves both routes. The alternative, two near-identical files,
 * is where the fields drift: a validation rule added to "create" and forgotten
 * on "edit" produces a record that could never have been created in the first
 * place.
 */
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { useI18n } from 'vue-i18n'

import {
  UiAlert,
  UiButton,
  UiCard,
  UiForm,
  UiPageHeader,
  UiSelect,
  UiSkeleton,
  UiTextField,
  UiTextarea,
} from '@/components/ui'
import { useBreadcrumbLabel } from '@/composables/useBreadcrumbs'
import { useRouteParam } from '@/composables/useRouteParam'
import { useNotificationStore } from '@/stores/notification'

import {
  useCreateCustomerMutation,
  useCustomerQuery,
  useUpdateCustomerMutation,
} from '../composables/useCustomers'
import { CUSTOMER_PLANS, CUSTOMER_STATUSES, customerDraftSchema } from '../types'

const { t } = useI18n()
const router = useRouter()
const notifications = useNotificationStore()

// `/customers/new` and `/customers/:id/edit` share this component. The create
// route has no `:id` at all, so the absence of the param — not a magic "new"
// value — is what distinguishes the two.
const id = useRouteParam('id')
const isEdit = computed(() => Boolean(id.value))

const { item: existing, isPending } = useCustomerQuery(id)

useBreadcrumbLabel(() => (isEdit.value ? t('common_edit') : t('customers_new')))

const createMutation = useCreateCustomerMutation()
const updateMutation = useUpdateCustomerMutation()

const isSaving = computed(() => createMutation.isPending.value || updateMutation.isPending.value)
const saveError = computed(() => createMutation.error.value ?? updateMutation.error.value)

// The same zod schema the mock backend validates against, so the form rejects
// exactly what the server would. Cast because formwerk speaks Standard Schema.
const schema = customerDraftSchema as unknown as StandardSchemaV1

/**
 * `undefined` until the record arrives, so the form is not mounted with blank
 * values and then re-seeded — formwerk snapshots `initialValues` on mount, and
 * a later change would leave the fields empty while `isDirty` reported true.
 */
const initialValues = computed<Record<string, unknown> | undefined>(() => {
  if (!isEdit.value) {
    return { status: 'prospect', plan: 'starter', country: 'US', notes: '' }
  }
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

const statusOptions = computed(() =>
  CUSTOMER_STATUSES.map((value) => ({ label: t(`customers_status_${value}`), value })),
)
const planOptions = computed(() =>
  CUSTOMER_PLANS.map((value) => ({ label: t(`customers_plan_${value}`), value })),
)

async function onSubmit(values: Record<string, unknown>) {
  const draft = customerDraftSchema.parse(values)

  const saved = isEdit.value
    ? await updateMutation.mutateAsync({ id: id.value!, patch: draft })
    : await createMutation.mutateAsync(draft)

  notifications.add({
    type: 'success',
    message: isEdit.value ? t('customers_saved') : t('customers_created'),
  })
  await router.push(`/dashboard/customers/${saved.id}`)
}
</script>

<template>
  <div class="space-y-6">
    <UiPageHeader
      :title="isEdit ? t('customers_edit_title') : t('customers_new_title')"
      :description="t('customers_form_subtitle')"
    >
      <template #actions>
        <UiButton
          :to="isEdit ? `/dashboard/customers/${id}` : '/dashboard/customers'"
          variant="ghost"
        >
          {{ t('common_cancel') }}
        </UiButton>
      </template>
    </UiPageHeader>

    <UiCard class="max-w-3xl p-5">
      <div v-if="isEdit && isPending" class="space-y-4" aria-busy="true">
        <UiSkeleton v-for="index in 6" :key="index" class="h-11" />
      </div>

      <UiForm
        v-else-if="initialValues"
        :schema="schema"
        :initial-values="initialValues"
        @submit="onSubmit"
      >
        <!--
          The failure is announced where the user is looking, above the submit
          button, not as a toast that may have vanished by the time they look
          up. `UiAlert` carries role="alert", so it is read immediately.
        -->
        <UiAlert v-if="saveError" variant="error" :title="t('common_error_title')">
          {{ saveError.message }}
        </UiAlert>

        <div class="grid gap-4 sm:grid-cols-2">
          <UiTextField name="company" :label="t('customers_col_company')" required />
          <UiTextField name="contactName" :label="t('customers_col_contact')" required />
          <UiTextField name="email" type="email" :label="t('common_email')" required />
          <UiTextField name="phone" :label="t('customers_phone')" required />
          <UiSelect name="status" :label="t('common_status')" :options="statusOptions" />
          <UiSelect name="plan" :label="t('customers_col_plan')" :options="planOptions" />
          <UiTextField name="city" :label="t('customers_city')" required />
          <UiTextField name="country" :label="t('customers_country')" required />
        </div>

        <UiTextarea name="notes" :label="t('customers_notes_title')" :rows="4" />

        <div class="flex justify-end gap-2 pt-2">
          <UiButton
            :to="isEdit ? `/dashboard/customers/${id}` : '/dashboard/customers'"
            variant="ghost"
          >
            {{ t('common_cancel') }}
          </UiButton>
          <UiButton type="submit" variant="primary" :loading="isSaving" :disabled="isSaving">
            {{ isEdit ? t('common_save') : t('customers_create') }}
          </UiButton>
        </div>
      </UiForm>
    </UiCard>
  </div>
</template>
