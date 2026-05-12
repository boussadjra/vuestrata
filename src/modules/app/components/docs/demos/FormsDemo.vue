<script setup lang="ts">
import { z } from 'zod'

const roleOptions = [
  { label: 'Admin', value: 'admin' },
  { label: 'Member', value: 'member' },
  { label: 'Viewer', value: 'viewer' },
]

const memberSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters'),
  role: z.enum(['admin', 'member', 'viewer']),
  notes: z.string().max(280, 'Notes must be 280 characters or less').optional(),
  agreed: z.literal(true, {
    message: 'You must enable onboarding email to continue',
  }),
})

const lastSubmission = ref<Record<string, unknown> | null>(null)

function onSubmit(values: Record<string, unknown>) {
  lastSubmission.value = values
}
</script>

<template>
  <UiForm
    :schema="memberSchema"
    :initial-values="{
      name: '',
      role: 'member',
      notes: 'Prefers concise release notes and weekly status updates.',
      agreed: true,
    }"
    @submit="onSubmit"
  >
    <template #default="{ values, isSubmitting, isDirty, isTouched, isValid, wasSubmitted }">
      <div class="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <UiCard>
          <template #header>
            <div>
              <h3 class="text-surface-900 text-lg font-bold dark:text-white">Team member form</h3>
              <p class="text-surface-500 dark:text-surface-400 mt-1 text-sm">
                Detailed form management using UiForm + schema validation.
              </p>
            </div>
          </template>

          <div class="space-y-4">
            <UiTextField name="name" label="Full name" placeholder="Enter full name" required />
            <UiSelect name="role" label="Role" :options="roleOptions" required />
            <UiTextarea name="notes" label="Notes" :rows="4" />
            <UiCheckbox name="agreed" label="Send onboarding email automatically" />
          </div>

          <template #footer>
            <div class="flex items-center justify-between gap-3">
              <span class="text-surface-500 dark:text-surface-400 text-sm">
                {{
                  values.name
                    ? `${values.name} will be created as ${values.role}`
                    : 'Waiting for input'
                }}
              </span>
              <UiButton type="submit" variant="primary" :disabled="isSubmitting">
                {{ isSubmitting ? 'Saving…' : isDirty ? 'Save member' : 'Submit' }}
              </UiButton>
            </div>
          </template>
        </UiCard>

        <div class="space-y-3">
          <UiAlert :variant="isValid ? 'success' : 'warning'" title="Form state">
            <p>Dirty: {{ isDirty ? 'yes' : 'no' }}</p>
            <p>Touched: {{ isTouched ? 'yes' : 'no' }}</p>
            <p>Valid: {{ isValid ? 'yes' : 'no' }}</p>
            <p>Submitted: {{ wasSubmitted ? 'yes' : 'no' }}</p>
          </UiAlert>

          <UiCard>
            <template #header>
              <h4 class="text-surface-900 text-sm font-semibold dark:text-white">Live values</h4>
            </template>
            <pre
              class="text-surface-700 dark:text-surface-300 bg-surface-50 dark:bg-surface-800 max-h-56 overflow-auto rounded-lg p-3 font-mono text-xs"
              >{{ JSON.stringify(values, null, 2) }}</pre
            >
          </UiCard>

          <UiCard v-if="lastSubmission">
            <template #header>
              <h4 class="text-surface-900 text-sm font-semibold dark:text-white">
                Last submit payload
              </h4>
            </template>
            <pre
              class="text-surface-700 dark:text-surface-300 bg-surface-50 dark:bg-surface-800 max-h-56 overflow-auto rounded-lg p-3 font-mono text-xs"
              >{{ JSON.stringify(lastSubmission, null, 2) }}</pre
            >
          </UiCard>
        </div>
      </div>
    </template>
  </UiForm>
</template>
