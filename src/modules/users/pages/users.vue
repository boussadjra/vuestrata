<script setup lang="ts">
import { createColumnHelper } from '@tanstack/vue-table'
import { useI18n } from 'vue-i18n'

import { UiButton, UiDataGrid, UiSelect } from '@/components/ui'
import { useDataTable, type DataTableQueryState } from '@/composables/useDataTable'
import { useRbac } from '@/composables/useRbac'
import { resolveIcon } from '@/config/icon-provider'
import { ROLE_DEFINITIONS, getRegisteredPermissions } from '@/lib/rbac'
import { useNotificationStore } from '@/stores/notification'
import type { IconName } from '@/types'
import type { User, Role, BuiltinPermission } from '@/types'
import { useUpdateRoleMutation, useUsersQuery } from '~/modules/users'
import type { UserFilters } from '~/modules/users'

import InviteUserDialog from '../components/InviteUserDialog.vue'
import UserPermissionsPanel from '../components/UserPermissionsPanel.vue'

const { can } = useRbac()
const notifications = useNotificationStore()
const { t } = useI18n()

const editingUserId = ref<string | null>(null)
const editingRole = ref<Role>('member')
const showInviteDialog = ref(false)
const selectedUser = ref<User | null>(null)

const { updateRole } = useUpdateRoleMutation()

const canAssignRoles = can('roles:assign')
const canUpdateUsers = can('users:update')
const showActionsColumn = canAssignRoles || canUpdateUsers

const roleOptions: { value: Role; label: string }[] = Object.values(ROLE_DEFINITIONS).map((r) => ({
  value: r.name,
  label: r.label,
}))

const columnHelper = createColumnHelper<User>()
const serverUsers = ref<User[]>([])
const serverMeta = ref<{ total: number; totalPages: number } | null>(null)

function setEditingRole(value: string | number | Array<string | number>) {
  const nextValue = Array.isArray(value) ? value[0] : value

  if (typeof nextValue === 'string') {
    editingRole.value = nextValue as Role
  }
}

const columns = [
  columnHelper.accessor('name', {
    header: () => t('users_col_name'),
    meta: {
      label: t('users_col_name'),
      width: '16rem',
    },
  }),
  columnHelper.accessor('email', {
    header: () => t('users_col_email'),
    meta: {
      label: t('users_col_email'),
      width: '18rem',
    },
  }),
  columnHelper.accessor('role', {
    header: () => t('users_col_role'),
    cell: ({ row }) => {
      if (editingUserId.value === row.original.id) {
        return h(UiSelect, {
          modelValue: editingRole.value,
          options: roleOptions,
          'onUpdate:modelValue': setEditingRole,
        })
      }

      return h(
        'span',
        {
          class: [roleColor[row.original.role], 'rounded-full px-2.5 py-1 text-xs font-semibold'],
        },
        row.original.role,
      )
    },
    meta: {
      label: t('users_col_role'),
      filter: {
        variant: 'select',
        options: roleOptions,
      },
      width: '10rem',
    },
  }),
  columnHelper.accessor('provider', {
    header: () => t('users_col_provider'),
    cell: ({ row }) =>
      h('div', { class: 'flex items-center gap-1.5' }, [
        h('span', {
          class: [
            resolveIcon(providerIconName[row.original.provider ?? 'credentials'] ?? 'lock'),
            'text-muted-foreground h-4 w-4',
          ],
        }),
        h('span', row.original.provider ?? 'credentials'),
      ]),
    meta: {
      label: t('users_col_provider'),
      width: '10rem',
    },
  }),
  columnHelper.accessor('emailVerified', {
    header: () => t('users_col_verified'),
    cell: ({ row }) =>
      row.original.emailVerified
        ? h('span', { class: [resolveIcon('check-circle'), 'h-5 w-5 text-green-500'] })
        : h('span', { class: [resolveIcon('close-circle'), 'text-surface-300 h-5 w-5'] }),
    meta: {
      label: t('users_col_verified'),
      align: 'center',
      width: '7rem',
    },
  }),
  columnHelper.accessor('lastLoginAt', {
    header: () => t('users_col_last_login'),
    cell: ({ getValue }) => {
      const value = getValue()
      return value ? new Date(value).toLocaleDateString() : '—'
    },
    meta: {
      label: t('users_col_last_login'),
      width: '10rem',
    },
  }),
  ...(showActionsColumn
    ? [
        columnHelper.display({
          id: 'actions',
          header: () => t('users_col_actions'),
          enableHiding: false,
          cell: ({ row }) => {
            if (editingUserId.value === row.original.id) {
              return h('div', { class: 'flex items-center gap-2' }, [
                h(
                  UiButton,
                  { variant: 'ghost', size: 'sm', onClick: () => saveRole(row.original) },
                  { default: () => t('button_save') },
                ),
                h(
                  UiButton,
                  { variant: 'ghost', size: 'sm', onClick: cancelEdit },
                  { default: () => t('button_cancel') },
                ),
              ])
            }

            const actions: ReturnType<typeof h>[] = []

            if (canAssignRoles) {
              actions.push(
                h(
                  UiButton,
                  { variant: 'ghost', size: 'sm', onClick: () => startEditRole(row.original) },
                  { default: () => t('users_change_role') },
                ),
              )
            }

            if (canUpdateUsers) {
              actions.push(
                h(
                  UiButton,
                  {
                    variant: 'ghost',
                    size: 'sm',
                    onClick: () => {
                      selectedUser.value = row.original
                    },
                  },
                  { default: () => t('users_permissions') },
                ),
              )
            }

            return h('div', { class: 'flex items-center gap-2' }, actions)
          },
          meta: {
            label: t('users_col_actions'),
            width: '16rem',
          },
        }),
      ]
    : []),
]

const userTableState = useDataTable<User>({
  data: () => serverUsers.value,
  columns,
  enableFiltering: true,
  enablePagination: true,
  enableRowSelection: true,
  enableColumnVisibility: true,
  pageSize: 5,
  manualPagination: true,
  manualFiltering: true,
  manualSorting: true,
  rowCount: () => serverMeta.value?.total,
  pageCount: () => serverMeta.value?.totalPages,
  getRowId: (row) => row.id,
})

const { table, queryState } = userTableState

const userFilters = computed<UserFilters>(() => {
  const roleFilter = queryState.value.columnFilters.find((filter) => filter.id === 'role')?.value
  const primarySort = queryState.value.sorting[0]

  return {
    page: queryState.value.pagination.page,
    pageSize: queryState.value.pagination.pageSize,
    search: queryState.value.globalFilter || undefined,
    role: typeof roleFilter === 'string' ? roleFilter : undefined,
    sortBy: primarySort?.id,
    sortOrder: primarySort?.direction,
  }
})

const usersQuery = useUsersQuery(userFilters)
const loading = computed(() => usersQuery.isLoading.value || usersQuery.isFetching.value)

serverUsers.value = usersQuery.users.value
serverMeta.value = usersQuery.meta.value

watchEffect(() => {
  serverUsers.value = usersQuery.users.value
  serverMeta.value = usersQuery.meta.value
})

function startEditRole(user: User) {
  editingUserId.value = user.id
  editingRole.value = user.role
}

async function saveRole(user: User) {
  try {
    await updateRole(user.id, editingRole.value)
    notifications.add({
      type: 'success',
      title: t('users_role_updated'),
      message: `${user.name} → ${editingRole.value}`,
    })
  } catch {
    notifications.add({
      type: 'error',
      title: t('common_error'),
      message: t('users_role_update_failed'),
    })
  }
  editingUserId.value = null
}

function cancelEdit() {
  editingUserId.value = null
}

const roleColor: Record<Role, string> = {
  super_admin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  admin: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  manager: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  member: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  viewer: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  guest: 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-400',
}

const providerIconName: Record<string, IconName> = {
  credentials: 'lock',
  google: 'letter',
  github: 'code',
  microsoft: 'monitor',
}

const allPermissions = [...getRegisteredPermissions()] as BuiltinPermission[]

function permLabel(perm: string): string {
  return t(`perm_${perm.replace(':', '_')}`)
}
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <!-- Header -->
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 class="text-surface-900 text-3xl font-extrabold tracking-tight dark:text-white">
          {{ t('users_title') }}
        </h1>
        <p class="text-muted-foreground mt-1">{{ t('users_subtitle') }}</p>
      </div>
      <div class="flex gap-3">
        <UiButton v-if="can('users:create')" variant="primary" @click="showInviteDialog = true">
          <span :class="[resolveIcon('user-plus'), 'h-4 w-4']" />
          {{ t('users_invite') }}
        </UiButton>
      </div>
    </div>

    <!-- Role legend -->
    <div class="flex flex-wrap gap-2">
      <span
        v-for="roleDef in Object.values(ROLE_DEFINITIONS)"
        :key="roleDef.name"
        :class="[roleColor[roleDef.name], 'rounded-full px-3 py-1 text-xs font-semibold']"
      >
        {{ roleDef.label }} — {{ roleDef.permissions.length }} perms
      </span>
    </div>

    <!-- Table card -->
    <div
      class="dark:bg-surface-800/90 border-surface-200 dark:border-surface-700 overflow-hidden rounded-2xl border bg-white/90 shadow-sm"
    >
      <UiDataGrid
        :table="table"
        selectable
        :loading="loading"
        :loading-text="t('users_loading')"
        :search-placeholder="t('users_search')"
        :page-size-options="[5, 10, 20, 50]"
        :total-rows="serverMeta?.total"
        :empty-text="t('common_no_results')"
      />
    </div>

    <!-- Permissions Matrix -->
    <div
      class="dark:bg-surface-800/90 border-surface-200 dark:border-surface-700 rounded-2xl border bg-white/90 p-6 shadow-sm"
    >
      <h2 class="text-surface-900 mb-4 text-xl font-bold dark:text-white">
        {{ t('users_permissions') }}
      </h2>
      <p class="text-muted-foreground mb-4 text-sm">
        {{ t('users_permissions_desc') }}
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-surface-200 dark:border-surface-700 border-b">
              <th class="text-muted-foreground px-3 py-2 text-start font-semibold">
                {{ t('users_col_permission') }}
              </th>
              <th
                v-for="roleDef in Object.values(ROLE_DEFINITIONS)"
                :key="roleDef.name"
                class="text-muted-foreground px-3 py-2 text-center font-semibold"
              >
                {{ roleDef.label }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="perm in allPermissions"
              :key="perm"
              class="border-surface-100 dark:border-surface-800 border-b"
            >
              <td class="text-muted-foreground px-3 py-2 text-sm">
                {{ permLabel(perm) }}
              </td>
              <td
                v-for="roleDef in Object.values(ROLE_DEFINITIONS)"
                :key="roleDef.name"
                class="px-3 py-2 text-center"
              >
                <span
                  v-if="roleDef.permissions.includes(perm)"
                  :class="[resolveIcon('check-circle'), 'inline-block h-4 w-4 text-green-500']"
                />
                <span
                  v-else
                  :class="[
                    resolveIcon('close-circle'),
                    'text-surface-300 dark:text-surface-600 inline-block h-4 w-4',
                  ]"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Invite User Dialog -->
  <InviteUserDialog v-if="showInviteDialog" @close="showInviteDialog = false" />

  <!-- User Permissions Panel -->
  <UserPermissionsPanel v-if="selectedUser" :user="selectedUser" @close="selectedUser = null" />
</template>
