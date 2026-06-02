<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { UiButton, UiCheckbox } from '@/components/ui'
import { getRegisteredPermissions, getRolePermissions } from '@/lib/rbac'
import type { BuiltinPermission } from '@/lib/rbac/types'
import { useAuthStore } from '@/stores/auth'
import type { Permission, User } from '@/types'

import { useUpdatePermissionsMutation } from '../composables/useUpdatePermissionsMutation'

const props = defineProps<{ user: User }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()

const authStore = useAuthStore()
const { updatePermissions, isPending } = useUpdatePermissionsMutation()

// All registered permissions, grouped by namespace
const allPermissions = computed(() => [...getRegisteredPermissions()] as BuiltinPermission[])

const namespaces = computed(() => {
  const ns = new Set<string>()
  for (const p of allPermissions.value) {
    const [namespace] = p.split(':')
    if (namespace) ns.add(namespace)
  }
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
            {{ t('users_permissions_title') }}
          </h2>
          <p class="text-surface-500 dark:text-surface-400 mt-0.5 text-sm">
            {{ user.name }} · <span class="capitalize">{{ user.role }}</span>
          </p>
        </div>
        <UiButton variant="ghost" size="sm" icon aria-label="Close" @click="$emit('close')">
          ✕
        </UiButton>
      </div>

      <!-- Self-edit warning -->
      <div
        v-if="isSelf"
        role="status"
        class="mx-6 mt-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
      >
        {{ t('users_permissions_self_warning') }}
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
              <UiCheckbox
                :checked="selected.has(perm as Permission)"
                :disabled="isUsersReadDisabled(perm as Permission)"
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
        <UiButton type="button" variant="ghost" size="sm" @click="resetToRoleDefaults">
          {{ t('users_permissions_reset') }}
        </UiButton>
        <div class="flex gap-3">
          <UiButton type="button" variant="secondary" @click="$emit('close')">
            {{ t('button_cancel') }}
          </UiButton>
          <UiButton type="button" variant="primary" :disabled="isPending" @click="submit">
            {{ isPending ? t('forms_saving') : t('button_save') }}
          </UiButton>
        </div>
      </div>
    </div>
  </div>
</template>
