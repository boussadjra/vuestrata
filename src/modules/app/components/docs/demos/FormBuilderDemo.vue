<script setup lang="ts">
import { useFormBuilder } from '~/composables/useFormBuilder'

const { fields, values, isSubmitting, handleSubmit, reset } = useFormBuilder({
  fields: [
    {
      name: 'firstName',
      type: 'text',
      label: 'First name',
      placeholder: 'Jane',
      required: true,
      colSpan: 1,
    },
    {
      name: 'lastName',
      type: 'text',
      label: 'Last name',
      placeholder: 'Doe',
      required: true,
      colSpan: 1,
    },
    {
      name: 'email',
      type: 'email',
      label: 'Email',
      placeholder: 'jane@co.io',
      required: true,
      colSpan: 2,
    },
    {
      name: 'role',
      type: 'select',
      label: 'Role',
      colSpan: 1,
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Member', value: 'member' },
        { label: 'Viewer', value: 'viewer' },
      ],
    },
    {
      name: 'bio',
      type: 'textarea',
      label: 'Bio',
      placeholder: 'Tell us about yourself…',
      colSpan: 2,
    },
    { name: 'newsletter', type: 'checkbox', label: 'Subscribe to newsletter', colSpan: 2 },
  ],
  initialValues: { role: 'member', newsletter: false },
  onSubmit: async (data) => {
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000))
    alert(`Submitted: ${JSON.stringify(data, null, 2)}`)
  },
})
</script>

<template>
  <div class="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
    <UiCard>
      <template #header>
        <div>
          <h3 class="text-surface-900 text-lg font-bold dark:text-white">Config-driven form</h3>
          <p class="text-surface-500 dark:text-surface-400 mt-1 text-sm">
            Generated from a field definition array via useFormBuilder().
          </p>
        </div>
      </template>

      <UiFormBuilder
        :fields="fields"
        :submitting="isSubmitting"
        submit-label="Create user"
        :cols="2"
        @submit="handleSubmit"
      >
        <template #actions="{ submitting: isBusy }">
          <div class="flex justify-end gap-3 pt-2">
            <UiButton variant="outline" @click="reset()">Reset</UiButton>
            <UiButton type="submit" variant="primary" :disabled="isBusy">
              {{ isBusy ? 'Saving…' : 'Create user' }}
            </UiButton>
          </div>
        </template>
      </UiFormBuilder>
    </UiCard>

    <UiCard>
      <template #header>
        <h3 class="text-surface-900 text-lg font-bold dark:text-white">Form state</h3>
      </template>
      <pre
        class="text-surface-700 dark:text-surface-300 bg-surface-50 dark:bg-surface-800 max-h-64 overflow-auto rounded-lg p-3 font-mono text-xs"
        >{{ JSON.stringify(values, null, 2) }}</pre
      >
    </UiCard>
  </div>
</template>
