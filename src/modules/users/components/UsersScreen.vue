<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { UiButton, UiDataGrid, UiPageHeader, UiSelect } from '@/components/ui'
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
import { createColumns } from '@/composables/useDataTable'
import type { ListRouteState } from '@/composables/useListRouteState'
import { useRbac } from '@/composables/useRbac'
import { resolveIcon } from '@/config/icon-provider'
import { roleLabel } from '@/lib/rbac'
import type { User } from '@/types'

import { useUserRoleEditor } from '../composables/useUserRoleEditor'
import { useUsersTable } from '../composables/useUsersTable'
import {
  assignableRoles,
  listedRoles,
  providerIcon,
  providerLabel,
  roleBadgeClass,
} from '../presentation'
import InviteUserDialog from './InviteUserDialog.vue'
import RolePermissionMatrix from './RolePermissionMatrix.vue'
import UserPermissionsPanel from './UserPermissionsPanel.vue'

const props = defineProps<{ queryState: ListRouteState }>()
const { t, te } = useI18n()
const { can } = useRbac()

/** A role's name on screen: its translation, or the label the project gave it. */
const labelOf = (role: string) => roleLabel(role, { t, te })

const showInviteDialog = ref(false)
const selectedUser = ref<User | null>(null)

const editor = useUserRoleEditor()

const canAssignRoles = can('roles:assign')
const canUpdateUsers = can('users:update')
const showActionsColumn = canAssignRoles || canUpdateUsers

// What a user can be given: the roles a picker offers.
const roleOptions = computed(() =>
  assignableRoles().map((role) => ({ value: role.name, label: labelOf(role.name) })),
)
// What a user can already have: every role, assignable here or not.
const roleFilterOptions = computed(() =>
  listedRoles().map((role) => ({ value: role.name, label: labelOf(role.name) })),
)

const col = createColumns<User>()
const columns = computed(() => [
  col.text('name', { label: t('users_col_name'), width: 256 }),
  col.text('email', { label: t('users_col_email'), width: 288 }),
  col.text('role', {
    label: t('users_col_role'),
    width: 160,
    filter: { variant: 'select', options: roleFilterOptions.value },
    render: ({ row }) => {
      if (editor.isEditing(row)) {
        return h(UiSelect, {
          modelValue: editor.editingRole.value,
          options: roleOptions.value,
          'onUpdate:modelValue': editor.setRole,
        })
      }

      return h(
        'span',
        {
          class: [roleBadgeClass(row.role), 'rounded-full px-2.5 py-1 text-xs font-semibold'],
        },
        labelOf(row.role),
      )
    },
  }),
  col.text('provider', {
    label: t('users_col_provider'),
    width: 160,
    format: (value) => providerLabel(value),
    render: ({ row }) =>
      h('div', { class: 'flex items-center gap-1.5' }, [
        h('span', {
          class: [resolveIcon(providerIcon(row.provider)), 'text-muted-foreground h-4 w-4'],
          'aria-hidden': 'true',
        }),
        h('span', providerLabel(row.provider)),
      ]),
  }),
  col.text('emailVerified', {
    label: t('users_col_verified'),
    width: 112,
    align: 'center',
    format: (value) => t(value ? 'common_yes' : 'common_no'),
    render: ({ row }) =>
      h('span', {
        class: [
          resolveIcon(row.emailVerified ? 'check-circle' : 'close-circle'),
          'h-5 w-5',
          row.emailVerified ? 'text-success' : 'text-muted-foreground',
        ],
        role: 'img',
        'aria-label': t(row.emailVerified ? 'common_yes' : 'common_no'),
      }),
  }),
  col.date('lastLoginAt', { label: t('users_col_last_login'), width: 160 }),
  ...(showActionsColumn
    ? [
        col.display('actions', {
          label: t('users_col_actions'),
          width: 256,
          hideable: false,
          sortable: false,
          cell: ({ row }) => {
            if (editor.isEditing(row)) {
              return h('div', { class: 'flex items-center gap-2' }, [
                h(
                  UiButton,
                  { variant: 'ghost', size: 'sm', onClick: () => editor.save(row) },
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
                  { variant: 'ghost', size: 'sm', onClick: () => editor.start(row) },
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
                      selectedUser.value = row
                    },
                  },
                  { default: () => t('users_permissions') },
                ),
              )
            }

            return h('div', { class: 'flex items-center gap-2' }, actions)
          },
        }),
      ]
    : []),
])

const { table, meta, isLoading, error, refetch } = useUsersTable(columns, props.queryState)
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
        v-for="roleDef in listedRoles()"
        :key="roleDef.name"
        :class="[roleBadgeClass(roleDef.name), 'rounded-full px-3 py-1 text-xs font-semibold']"
      >
        {{ labelOf(roleDef.name) }}
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
        :manual="true"
        :show-column-filters="true"
        :error="Boolean(error)"
        @retry="refetch"
        selectable
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
