<script setup lang="ts">
/**
 * User management — the whole experience behind `/dashboard/users`.
 *
 * Owns the directory table, inline role editing, the invite dialog and the
 * permissions panel. Nothing here reads the router: the route decides that this
 * screen is what the URL means, and the screen decides everything after that.
 *
 * The column definitions stay in this component because they *are* the
 * presentation — they render buttons, badges and a select. The rules those
 * cells draw on (role tints, provider marks) are in `presentation.ts`, and the
 * table/query wiring is in `useUsersTable`.
 */
import { createColumnHelper } from '@tanstack/vue-table'
import { useI18n } from 'vue-i18n'

import { UiButton, UiDataGrid, UiPageHeader, UiSelect } from '@/components/ui'
import { useRbac } from '@/composables/useRbac'
import { resolveIcon } from '@/config/icon-provider'
import { ROLE_DEFINITIONS } from '@/lib/rbac'
import type { User } from '@/types'

import { useUserRoleEditor } from '../composables/useUserRoleEditor'
import { useUsersTable } from '../composables/useUsersTable'
import { providerIcon, providerLabel, roleBadgeClass } from '../presentation'
import InviteUserDialog from './InviteUserDialog.vue'
import RolePermissionMatrix from './RolePermissionMatrix.vue'
import UserPermissionsPanel from './UserPermissionsPanel.vue'

const { t } = useI18n()
const { can } = useRbac()

const showInviteDialog = ref(false)
const selectedUser = ref<User | null>(null)

const editor = useUserRoleEditor()

const canAssignRoles = can('roles:assign')
const canUpdateUsers = can('users:update')
const showActionsColumn = canAssignRoles || canUpdateUsers

const roleOptions = computed(() =>
  Object.values(ROLE_DEFINITIONS).map((role) => ({
    value: role.name,
    label: t(`role_${role.name}`),
  })),
)

const columnHelper = createColumnHelper<User>()

const columns = [
  columnHelper.accessor('name', {
    header: () => t('users_col_name'),
    meta: { label: t('users_col_name'), width: '16rem' },
  }),
  columnHelper.accessor('email', {
    header: () => t('users_col_email'),
    meta: { label: t('users_col_email'), width: '18rem' },
  }),
  columnHelper.accessor('role', {
    header: () => t('users_col_role'),
    cell: ({ row }) => {
      if (editor.isEditing(row.original)) {
        return h(UiSelect, {
          modelValue: editor.editingRole.value,
          options: roleOptions.value,
          'onUpdate:modelValue': editor.setRole,
        })
      }

      return h(
        'span',
        {
          class: [
            roleBadgeClass(row.original.role),
            'rounded-full px-2.5 py-1 text-xs font-semibold',
          ],
        },
        t(`role_${row.original.role}`),
      )
    },
    meta: {
      label: t('users_col_role'),
      filter: { variant: 'select', options: roleOptions.value },
      width: '10rem',
    },
  }),
  columnHelper.accessor('provider', {
    header: () => t('users_col_provider'),
    cell: ({ row }) =>
      h('div', { class: 'flex items-center gap-1.5' }, [
        h('span', {
          class: [
            resolveIcon(providerIcon(row.original.provider)),
            'text-muted-foreground h-4 w-4',
          ],
        }),
        h('span', providerLabel(row.original.provider)),
      ]),
    meta: { label: t('users_col_provider'), width: '10rem' },
  }),
  columnHelper.accessor('emailVerified', {
    header: () => t('users_col_verified'),
    cell: ({ row }) =>
      row.original.emailVerified
        ? h('span', { class: [resolveIcon('check-circle'), 'h-5 w-5 text-green-500'] })
        : h('span', { class: [resolveIcon('close-circle'), 'text-surface-300 h-5 w-5'] }),
    meta: { label: t('users_col_verified'), align: 'center', width: '7rem' },
  }),
  columnHelper.accessor('lastLoginAt', {
    header: () => t('users_col_last_login'),
    cell: ({ getValue }) => {
      const value = getValue()
      return value ? new Date(value).toLocaleDateString() : '—'
    },
    meta: { label: t('users_col_last_login'), width: '10rem' },
  }),
  ...(showActionsColumn
    ? [
        columnHelper.display({
          id: 'actions',
          header: () => t('users_col_actions'),
          enableHiding: false,
          cell: ({ row }) => {
            if (editor.isEditing(row.original)) {
              return h('div', { class: 'flex items-center gap-2' }, [
                h(
                  UiButton,
                  { variant: 'ghost', size: 'sm', onClick: () => editor.save(row.original) },
                  { default: () => t('button_save') },
                ),
                h(
                  UiButton,
                  { variant: 'ghost', size: 'sm', onClick: editor.cancel },
                  { default: () => t('button_cancel') },
                ),
              ])
            }

            const actions: ReturnType<typeof h>[] = []

            if (canAssignRoles) {
              actions.push(
                h(
                  UiButton,
                  { variant: 'ghost', size: 'sm', onClick: () => editor.start(row.original) },
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
          meta: { label: t('users_col_actions'), width: '16rem' },
        }),
      ]
    : []),
]

const { table, meta, isLoading } = useUsersTable(columns)
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <UiPageHeader :title="t('users_title')" :description="t('users_subtitle')">
      <template #actions>
        <UiButton v-if="can('users:create')" variant="primary" @click="showInviteDialog = true">
          <span :class="[resolveIcon('user-plus'), 'h-4 w-4']" />
          {{ t('users_invite') }}
        </UiButton>
      </template>
    </UiPageHeader>

    <!-- Role legend -->
    <div class="flex flex-wrap gap-2">
      <span
        v-for="roleDef in Object.values(ROLE_DEFINITIONS)"
        :key="roleDef.name"
        :class="[roleBadgeClass(roleDef.name), 'rounded-full px-3 py-1 text-xs font-semibold']"
      >
        {{ t(`role_${roleDef.name}`) }}
        ·
        {{ t('users_perm_count', { count: roleDef.permissions.length }) }}
      </span>
    </div>

    <!-- Table card -->
    <div
      class="dark:bg-surface-800/90 border-surface-200 dark:border-surface-700 overflow-hidden rounded-2xl border bg-white/90 shadow-sm"
    >
      <UiDataGrid
        :table="table"
        selectable
        :show-column-filters="false"
        :loading="isLoading"
        :loading-text="t('users_loading')"
        :search-placeholder="t('users_search')"
        :page-size-options="[5, 10, 20, 50]"
        :total-rows="meta?.total"
        :empty-text="t('common_no_results')"
      />
    </div>

    <RolePermissionMatrix />
  </div>

  <InviteUserDialog v-if="showInviteDialog" @close="showInviteDialog = false" />

  <UserPermissionsPanel v-if="selectedUser" :user="selectedUser" @close="selectedUser = null" />
</template>
