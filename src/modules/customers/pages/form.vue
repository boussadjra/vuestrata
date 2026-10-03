<script setup lang="ts">
/**
 * Create / edit a customer — the single-form pattern.
 *
 * One component serves both routes. The alternative, two near-identical files,
 * is where the fields drift: a validation rule added to "create" and forgotten
 * on "edit" produces a record that could never have been created in the first
 * place.
 *
 * The page lays the fields out and decides where to go once a save has
 * succeeded. What saving means is `useCustomerForm`'s, and the submit
 * lifecycle (the pending button, the server's messages on the fields they are
 * about, the question before unsaved changes are discarded) is `UiForm`'s.
 */
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

import { useCustomerForm } from '../composables/useCustomerForm'
import type { Customer } from '../types'

const { t } = useI18n()
const router = useRouter()

// `/customers/new` and `/customers/:id/edit` share this component. The create
// route has no `:id` at all, so the absence of the param — not a magic "new"
// value — is what distinguishes the two.
const id = useRouteParam('id')

const { schema, isEdit, isLoading, initialValues, statusOptions, planOptions, save } =
  useCustomerForm(id)

useBreadcrumbLabel(() => (isEdit.value ? t('common_edit') : t('customers_new')))

const backTo = computed(() =>
  isEdit.value ? `/dashboard/customers/${id.value}` : '/dashboard/customers',
)

// By the time this runs the form has taken the saved values as its baseline,
// so it is clean and the unsaved-changes guard lets the navigation through.
async function onSaved(saved: unknown) {
  await router.push(`/dashboard/customers/${(saved as Customer).id}`)
}
</script>

<template>
  <div class="space-y-6">
    <UiPageHeader
      :title="isEdit ? t('customers_edit_title') : t('customers_new_title')"
      :description="t('customers_form_subtitle')"
    >
      <template #actions>
        <UiButton :to="backTo" variant="ghost">
          {{ t('common_cancel') }}
        </UiButton>
      </template>
    </UiPageHeader>

    <UiCard class="max-w-3xl p-5">
      <div v-if="isLoading" class="space-y-4" aria-busy="true">
        <UiSkeleton v-for="index in 6" :key="index" class="h-11" />
      </div>

      <!--
        Keyed by the record: the form takes its initial values when it mounts,
        so another customer in the same page needs another form.

        `show-errors="touched"` keeps a new, empty form from opening with
        "required" under every field. `confirm-leave` asks before a navigation
        discards what was typed.
      -->
      <UiForm
        v-else-if="initialValues"
        :key="id ?? 'new'"
        :schema="schema"
        :initial-values="initialValues"
        :action="save"
        show-errors="touched"
        confirm-leave
        @success="onSaved"
      >
        <template #default="{ formErrors, isSubmitting }">
          <!--
            What the server said that belongs to no field, or failing that the
            one line describing the failure, in the reader's language. It is
            announced where the user is looking, above the submit button, not
            as a toast that may have vanished by the time they look up:
            `UiAlert` carries role="alert", so it is read immediately.

            A message about one field is not here. `UiForm` puts it under that
            field, where it stays until the field is edited.
          -->
          <UiAlert v-if="formErrors.length > 0" variant="error" :title="t('common_error_title')">
            <p v-for="message in formErrors" :key="message">{{ message }}</p>
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
            <UiButton :to="backTo" variant="ghost">
              {{ t('common_cancel') }}
            </UiButton>
            <UiButton
              type="submit"
              variant="primary"
              :loading="isSubmitting"
              :disabled="isSubmitting"
            >
              {{ isEdit ? t('common_save') : t('customers_create') }}
            </UiButton>
          </div>
        </template>
      </UiForm>
    </UiCard>
  </div>
</template>
