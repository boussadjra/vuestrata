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

function permLabel(perm: string): string {
  const key = `perm_${perm.replaceAll(':', '_')}`
  const translated = t(key)
  if (translated !== key) return translated
  return perm
    .split(':')
    .map((part) => part.replaceAll('_', ' '))
    .join(' ')
}

function permNamespaceLabel(ns: string): string {
  const key = `perm_ns_${ns}`
  const translated = t(key)
  return translated !== key ? translated : ns
}

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

function setPermission(perm: Permission, enabled: boolean | 'indeterminate') {
  if (isUsersReadDisabled(perm)) return
  if (enabled === true) {
    selected.value.add(perm)
    return
  }

  selected.value.delete(perm)
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
          <p class="text-muted-foreground mt-0.5 text-sm">
            {{ user.name }} · {{ t(`role_${user.role}`) }}
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
        class="bg-warning-subtle text-warning-800 dark:text-warning-200 mx-6 mt-4 rounded-lg px-4 py-2 text-sm"
      >
        {{ t('users_permissions_self_warning', { permission: permLabel('users:read') }) }}
      </div>

      <!-- Server error -->
      <p
        v-if="serverError"
        role="alert"
        class="bg-destructive-subtle text-destructive mx-6 mt-3 rounded-lg px-4 py-2 text-sm"
      >
        {{ serverError }}
      </p>

      <!-- Permissions list -->
      <div class="flex-1 overflow-y-auto px-6 py-4">
        <div v-for="ns in namespaces" :key="ns" class="mb-4">
          <h3 class="text-muted-foreground mb-2 text-xs font-semibold tracking-widest uppercase">
            {{ permNamespaceLabel(ns) }}
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
                :model-value="selected.has(perm as Permission)"
                :disabled="isUsersReadDisabled(perm as Permission)"
                @update:model-value="setPermission(perm as Permission, $event)"
              />
              <span class="text-foreground flex-1 text-sm">
                {{ permLabel(perm) }}
              </span>
              <span
                v-if="roleDefaults.has(perm)"
                class="bg-info-subtle text-info-700 dark:text-info-300 rounded px-1.5 py-0.5 text-xs"
              >
                {{ t('users_permission_default') }}
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
