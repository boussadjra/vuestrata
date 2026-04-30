<script setup lang="ts">
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
        <button
          class="text-surface-400 hover:text-surface-600 dark:hover:text-surface-200"
          aria-label="Close dialog"
          @click="$emit('close')"
        >
          ✕
        </button>
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
        <div>
          <label
            for="invite-email"
            class="text-surface-700 dark:text-surface-300 mb-1 block text-sm font-medium"
          >
            Email
          </label>
          <input
            id="invite-email"
            v-model="email"
            type="email"
            autocomplete="email"
            :aria-invalid="!!fieldErrors.email"
            :aria-describedby="fieldErrors.email ? 'invite-email-error' : undefined"
            class="border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-800 focus:border-primary-500 focus:ring-primary-500/20 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2"
            :class="{ 'border-red-400': fieldErrors.email }"
          />
          <p
            v-if="fieldErrors.email"
            id="invite-email-error"
            role="alert"
            class="mt-1 text-xs text-red-500"
          >
            {{ fieldErrors.email }}
          </p>
        </div>

        <!-- Name -->
        <div>
          <label
            for="invite-name"
            class="text-surface-700 dark:text-surface-300 mb-1 block text-sm font-medium"
          >
            Name
          </label>
          <input
            id="invite-name"
            v-model="name"
            type="text"
            autocomplete="name"
            :aria-invalid="!!fieldErrors.name"
            :aria-describedby="fieldErrors.name ? 'invite-name-error' : undefined"
            class="border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-800 focus:border-primary-500 focus:ring-primary-500/20 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2"
            :class="{ 'border-red-400': fieldErrors.name }"
          />
          <p
            v-if="fieldErrors.name"
            id="invite-name-error"
            role="alert"
            class="mt-1 text-xs text-red-500"
          >
            {{ fieldErrors.name }}
          </p>
        </div>

        <!-- Role -->
        <div>
          <label
            for="invite-role"
            class="text-surface-700 dark:text-surface-300 mb-1 block text-sm font-medium"
          >
            Role
          </label>
          <select
            id="invite-role"
            v-model="role"
            class="border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-800 focus:border-primary-500 focus:ring-primary-500/20 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2"
          >
            <option v-for="opt in roleOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>

        <!-- Footer -->
        <div class="flex justify-end gap-3 pt-2">
          <button
            type="button"
            class="border-surface-200 dark:border-surface-600 text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 rounded-xl border px-4 py-2 text-sm font-medium"
            @click="$emit('close')"
          >
            Cancel
          </button>
          <button
            type="submit"
            :disabled="isPending"
            class="bg-primary-600 hover:bg-primary-500 disabled:bg-primary-300 w-full rounded-xl px-4 py-2 text-sm font-medium text-white transition-colors"
          >
            {{ isPending ? 'Sending…' : 'Send Invite' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
