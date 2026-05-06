<script setup lang="ts">
import { UiButton, UiSelect, UiTextField } from '@/components/ui'
import { ROLE_DEFINITIONS } from '@/lib/rbac'
import type { Role } from '@/types'

import { useInviteUserMutation } from '../composables/useInviteUserMutation'

const emit = defineEmits<{ close: [] }>()

const { inviteUser, isPending } = useInviteUserMutation()

const email = ref('')
const name = ref('')
const role = ref<Role>('member')
const fieldErrors = ref<{ email?: string; name?: string; server?: string }>({})

const roleOptions = Object.values(ROLE_DEFINITIONS)
  .filter((r) => r.name !== 'guest')
  .map((r) => ({ value: r.name as Role, label: r.label }))

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

async function submit() {
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
          Invite User
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
          class="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400"
        >
          {{ fieldErrors.server }}
        </p>

        <!-- Email -->
        <UiTextField
          id="invite-email"
          v-model="email"
          type="email"
          label="Email"
          autocomplete="email"
          :error="fieldErrors.email"
          @blur="() => {}"
        />

        <!-- Name -->
        <UiTextField
          id="invite-name"
          v-model="name"
          type="text"
          label="Name"
          autocomplete="name"
          :error="fieldErrors.name"
          @blur="() => {}"
        />

        <!-- Role -->
        <UiSelect id="invite-role" v-model="role" label="Role" :options="roleOptions" />

        <!-- Footer -->
        <div class="flex justify-end gap-3 pt-2">
          <UiButton type="button" variant="secondary" @click="$emit('close')"> Cancel </UiButton>
          <UiButton type="submit" variant="primary" :disabled="isPending">
            {{ isPending ? 'Sending…' : 'Send Invite' }}
          </UiButton>
        </div>
      </form>
    </div>
  </div>
</template>
