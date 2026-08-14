<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { UiButton, UiSelect, UiTextField } from '@/components/ui'
import { ROLE_DEFINITIONS } from '@/lib/rbac'
import type { Role } from '@/types'

import { useInviteUserMutation } from '../composables/useInviteUserMutation'

const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()

const { inviteUser, isPending } = useInviteUserMutation()

const email = ref('')
const name = ref('')
const role = ref<Role>('member')
const fieldErrors = ref<{ email?: string; name?: string; server?: string }>({})

const roleOptions = computed(() =>
  Object.values(ROLE_DEFINITIONS)
    .filter((r) => r.name !== 'guest')
    .map((r) => ({ value: r.name as Role, label: t(`role_${r.name}`) })),
)

function readInputValue(event: Event | undefined, selector: string, fallback = ''): string {
  const formElement = event?.currentTarget
  if (!(formElement instanceof HTMLFormElement)) return fallback
  const input = formElement.querySelector<HTMLInputElement>(selector)
  return input?.value ?? fallback
}

function validate(): boolean {
  fieldErrors.value = {}
  if (!email.value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
    fieldErrors.value.email = 'A valid email address is required.'
  }
  if (!name.value.trim()) {
    fieldErrors.value.name = 'Name is required.'
  }
  return Object.keys(fieldErrors.value).length === 0
}

async function submit(event: Event) {
  email.value = readInputValue(event, '#invite-email', email.value)
  name.value = readInputValue(event, '#invite-name', name.value)
  if (!validate()) return
  try {
    await inviteUser({ email: email.value, name: name.value.trim(), role: role.value })
    emit('close')
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to invite user. Please try again.'
    fieldErrors.value.server = message
  }
}
</script>

<template>
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="invite-dialog-title"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    @click.self="$emit('close')"
  >
    <div
      class="dark:bg-surface-900 border-surface-200 dark:border-surface-700 w-full max-w-md rounded-2xl border bg-white shadow-xl"
    >
      <!-- Header -->
      <div
        class="border-surface-200 dark:border-surface-700 flex items-center justify-between border-b px-6 py-4"
      >
        <h2 id="invite-dialog-title" class="text-surface-900 text-lg font-semibold dark:text-white">
          {{ t('users_invite_title') }}
        </h2>
        <UiButton variant="ghost" size="sm" icon aria-label="Close dialog" @click="$emit('close')">
          ✕
        </UiButton>
      </div>

      <!-- Body -->
      <form class="space-y-4 px-6 py-5" novalidate @submit.prevent="submit">
        <!-- Server error -->
        <p
          v-if="fieldErrors.server"
          role="alert"
          class="bg-destructive-subtle text-destructive rounded-lg px-4 py-2 text-sm"
        >
          {{ fieldErrors.server }}
        </p>

        <!-- Email -->
        <UiTextField
          id="invite-email"
          v-model="email"
          type="email"
          :label="t('users_invite_email')"
          autocomplete="email"
          :error="fieldErrors.email"
          @blur="() => {}"
        />

        <!-- Name -->
        <UiTextField
          id="invite-name"
          v-model="name"
          type="text"
          :label="t('forms_name')"
          autocomplete="name"
          :error="fieldErrors.name"
          @blur="() => {}"
        />

        <!-- Role -->
        <UiSelect
          id="invite-role"
          v-model="role"
          :label="t('users_invite_role')"
          :options="roleOptions"
        />

        <!-- Footer -->
        <div class="flex justify-end gap-3 pt-2">
          <UiButton type="button" variant="secondary" @click="$emit('close')">
            {{ t('button_cancel') }}
          </UiButton>
          <UiButton type="submit" variant="primary" :disabled="isPending">
            {{ isPending ? t('forms_sending') : t('users_invite_send') }}
          </UiButton>
        </div>
      </form>
    </div>
  </div>
</template>
