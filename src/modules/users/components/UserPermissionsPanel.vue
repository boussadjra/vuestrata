<script setup lang="ts">
import { getRegisteredPermissions, getRolePermissions } from '@/lib/rbac'
import type { BuiltinPermission } from '@/lib/rbac/types'
import { useAuthStore } from '@/stores/auth'
import type { Permission, User } from '@/types'

import { useUpdatePermissionsMutation } from '../composables/useUpdatePermissionsMutation'

const props = defineProps<{ user: User }>()
const emit = defineEmits<{ close: [] }>()

const authStore = useAuthStore()
const { updatePermissions, isPending } = useUpdatePermissionsMutation()

// All registered permissions, grouped by namespace
const allPermissions = computed(() => [...getRegisteredPermissions()] as BuiltinPermission[])

const namespaces = computed(() => {
  const ns = new Set<string>()
  for (const p of allPermissions.value) ns.add(p.split(':')[0])
  return [...ns].sort()
})

function permissionsForNamespace(ns: string) {
  return allPermissions.value.filter((p) => p.startsWith(ns + ':'))
}

// Effective permissions: user's explicit list OR role defaults
const roleDefaults = computed(() => new Set(getRolePermissions(props.user.role)))

const selected = ref<Set<Permission>>(
  new Set(props.user.permissions ?? getRolePermissions(props.user.role)),
)

const isSelf = computed(() => authStore.user?.id === props.user.id)

function isUsersReadDisabled(perm: Permission) {
  return isSelf.value && perm === 'users:read'
}

function togglePermission(perm: Permission) {
  if (isUsersReadDisabled(perm)) return
  if (selected.value.has(perm)) {
    selected.value.delete(perm)
  } else {
    selected.value.add(perm)
  }
}

function resetToRoleDefaults() {
  selected.value = new Set(getRolePermissions(props.user.role))
}

const serverError = ref<string | null>(null)

async function submit() {
  serverError.value = null
  try {
    await updatePermissions({ id: props.user.id, permissions: [...selected.value] as Permission[] })
    emit('close')
  } catch (err: unknown) {
    serverError.value =
      err instanceof Error ? err.message : 'Failed to update permissions. Please try again.'
  }
}
</script>

<template>
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="permissions-panel-title"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    @click.self="$emit('close')"
  >
    <div
      class="dark:bg-surface-900 border-surface-200 dark:border-surface-700 flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border bg-white shadow-xl"
    >
      <!-- Header -->
      <div
        class="border-surface-200 dark:border-surface-700 flex items-center justify-between border-b px-6 py-4"
      >
        <div>
          <h2
            id="permissions-panel-title"
            class="text-surface-900 text-lg font-semibold dark:text-white"
          >
            Permissions
          </h2>
          <p class="text-surface-500 dark:text-surface-400 mt-0.5 text-sm">
            {{ user.name }} · <span class="capitalize">{{ user.role }}</span>
          </p>
        </div>
        <button
          class="text-surface-400 hover:text-surface-600 dark:hover:text-surface-200"
          aria-label="Close"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>

      <!-- Self-edit warning -->
      <div
        v-if="isSelf"
        role="status"
        class="mx-6 mt-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
      >
        You are editing your own account. The <strong>users:read</strong> permission cannot be
        removed.
      </div>

      <!-- Server error -->
      <p
        v-if="serverError"
        role="alert"
        class="mx-6 mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400"
      >
        {{ serverError }}
      </p>

      <!-- Permissions list -->
      <div class="flex-1 overflow-y-auto px-6 py-4">
        <div v-for="ns in namespaces" :key="ns" class="mb-4">
          <h3
            class="text-surface-500 dark:text-surface-400 mb-2 text-xs font-semibold tracking-widest uppercase"
          >
            {{ ns }}
          </h3>
          <div class="space-y-1">
            <label
              v-for="perm in permissionsForNamespace(ns)"
              :key="perm"
              class="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors"
              :class="{
                'hover:bg-surface-100 dark:hover:bg-surface-800': !isUsersReadDisabled(
                  perm as Permission,
                ),
                'cursor-not-allowed opacity-50': isUsersReadDisabled(perm as Permission),
              }"
            >
              <input
                type="checkbox"
                :checked="selected.has(perm as Permission)"
                :disabled="isUsersReadDisabled(perm as Permission)"
                class="text-primary-600 focus:ring-primary-500 h-4 w-4 rounded"
                @change="togglePermission(perm as Permission)"
              />
              <span class="text-surface-800 dark:text-surface-200 flex-1 text-sm">
                {{ perm }}
              </span>
              <span
                v-if="roleDefaults.has(perm)"
                class="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
              >
                default
              </span>
            </label>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div
        class="border-surface-200 dark:border-surface-700 flex items-center justify-between border-t px-6 py-4"
      >
        <button
          type="button"
          class="text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 text-sm underline-offset-2 hover:underline"
          @click="resetToRoleDefaults"
        >
          Reset to role defaults
        </button>
        <div class="flex gap-3">
          <button
            type="button"
            class="border-surface-200 dark:border-surface-600 text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 rounded-xl border px-4 py-2 text-sm font-medium"
            @click="$emit('close')"
          >
            Cancel
          </button>
          <button
            type="button"
            :disabled="isPending"
            class="bg-primary-600 hover:bg-primary-500 disabled:bg-primary-300 rounded-xl px-4 py-2 text-sm font-medium text-white transition-colors"
            @click="submit"
          >
            {{ isPending ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
