<script setup lang="ts">
import { createColumnHelper } from '@tanstack/vue-table'
import { FlexRender } from '@tanstack/vue-table'
import { useI18n } from 'vue-i18n'

import { UiButton, UiSelect, UiTextField } from '@/components/ui'
import { useDataTable } from '@/composables/useDataTable'
import { useRbac } from '@/composables/useRbac'
import { resolveIcon } from '@/config/icon-provider'
import { ROLE_DEFINITIONS, getRegisteredPermissions } from '@/lib/rbac'
import { useNotificationStore } from '@/stores/notification'
import type { IconName } from '@/types'
import type { User, Role, BuiltinPermission } from '@/types'
import { useUpdateRoleMutation, useUsersQuery } from '~/modules/users'

import InviteUserDialog from '../components/InviteUserDialog.vue'
import UserPermissionsPanel from '../components/UserPermissionsPanel.vue'

const { can, isAtLeast } = useRbac()
const notifications = useNotificationStore()
const { t } = useI18n()

const editingUserId = ref<string | null>(null)
const editingRole = ref<Role>('member')
const showInviteDialog = ref(false)
const selectedUser = ref<User | null>(null)

const { users, isLoading: loading } = useUsersQuery(ref({ pageSize: 50 }))

const { updateRole } = useUpdateRoleMutation()

const roleOptions: { value: Role; label: string }[] = Object.values(ROLE_DEFINITIONS).map((r) => ({
  value: r.name,
  label: r.label,
}))

const columnHelper = createColumnHelper<User>()

const columns = [
  columnHelper.display({
    id: 'select',
    header: ({ table }) =>
      h('input', {
        type: 'checkbox',
        checked: table.getIsAllPageRowsSelected(),
        onChange: (e: Event) =>
          table.toggleAllPageRowsSelected((e.target as HTMLInputElement).checked),
        class: 'rounded border-surface-300 dark:border-surface-600',
      }),
    cell: ({ row }) =>
      h('input', {
        type: 'checkbox',
        checked: row.getIsSelected(),
        onChange: () => row.toggleSelected(),
        class: 'rounded border-surface-300 dark:border-surface-600',
      }),
    size: 40,
  }),
  columnHelper.accessor('name', {
    header: () => t('users_col_name'),
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('email', {
    header: () => t('users_col_email'),
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('role', {
    header: () => t('users_col_role'),
    cell: (info) => info.getValue(),
    filterFn: 'equals',
  }),
  columnHelper.accessor('provider', {
    header: () => t('users_col_provider'),
    cell: (info) => info.getValue() ?? 'credentials',
  }),
  columnHelper.accessor('emailVerified', {
    header: () => t('users_col_verified'),
    cell: (info) => (info.getValue() ? t('common_yes') : t('common_no')),
  }),
  columnHelper.accessor('lastLoginAt', {
    header: () => t('users_col_last_login'),
    cell: (info) => {
      const val = info.getValue()
      return val ? new Date(val).toLocaleDateString() : '—'
    },
  }),
]

const {
  table,
  globalFilter,
  sorting,
  rowSelection,
  pagination,
  selectedRows,
  totalRows,
  pageCount,
  currentPage,
} = useDataTable<User>({
  data: () => users.value,
  columns,
  enableRowSelection: true,
  enablePagination: true,
  pageSize: 5,
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

function setPageSize(value: number | string) {
  pagination.value = {
    ...pagination.value,
    pageSize: Number(value),
    pageIndex: 0,
  }
}

function onPageSizeChange(value: string | number | Array<string | number>) {
  setPageSize(Array.isArray(value) ? (value[0] ?? pagination.value.pageSize) : value)
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
        <p class="text-surface-500 dark:text-surface-400 mt-1">{{ t('users_subtitle') }}</p>
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
      <!-- Toolbar -->
      <div
        class="border-surface-200 dark:border-surface-700 flex flex-col items-start justify-between gap-3 border-b p-4 sm:flex-row sm:items-center"
      >
        <div class="flex w-full items-center gap-3 sm:w-auto">
          <UiTextField
            v-model="globalFilter"
            type="text"
            :placeholder="t('users_search')"
            icon="search"
            class="sm:w-64"
          />
          <span v-if="selectedRows.length" class="text-surface-500 text-sm">
            {{ selectedRows.length }} {{ t('common_selected') }}
          </span>
        </div>
        <div class="text-surface-500 text-sm">
          {{ totalRows }} {{ t('users_total') }} ·
          {{ t('common_page_of', { current: currentPage, total: pageCount }) }}
        </div>
      </div>

      <!-- Table -->
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr
              v-for="headerGroup in table.getHeaderGroups()"
              :key="headerGroup.id"
              class="border-surface-200 dark:border-surface-700 border-b"
            >
              <th
                v-for="header in headerGroup.headers"
                :key="header.id"
                :style="{ width: header.getSize() + 'px' }"
                class="text-surface-600 dark:text-surface-300 bg-surface-50/50 dark:bg-surface-900/50 px-4 py-3 text-left font-semibold"
                :class="{
                  'hover:text-primary-500 cursor-pointer select-none': header.column.getCanSort(),
                }"
                @click="header.column.getToggleSortingHandler()?.($event)"
              >
                <div class="flex items-center gap-1">
                  <FlexRender
                    v-if="!header.isPlaceholder"
                    :render="header.column.columnDef.header"
                    :props="header.getContext()"
                  />
                  <span
                    v-if="header.column.getIsSorted() === 'asc'"
                    :class="[resolveIcon('arrow-up'), 'h-3 w-3']"
                  />
                  <span
                    v-else-if="header.column.getIsSorted() === 'desc'"
                    :class="[resolveIcon('arrow-down'), 'h-3 w-3']"
                  />
                </div>
              </th>
              <th
                class="text-surface-600 dark:text-surface-300 bg-surface-50/50 dark:bg-surface-900/50 px-4 py-3 text-left font-semibold"
              >
                {{ t('users_col_actions') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td :colspan="columns.length + 1" class="text-surface-400 px-4 py-12 text-center">
                <span :class="[resolveIcon('refresh'), 'mb-2 inline-block h-6 w-6 animate-spin']" />
                <p>{{ t('users_loading') }}</p>
              </td>
            </tr>
            <tr
              v-for="row in table.getRowModel().rows"
              v-else
              :key="row.id"
              class="border-surface-100 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-800/50 border-b transition-colors"
              :class="{ 'bg-primary-50/50 dark:bg-primary-900/10': row.getIsSelected() }"
            >
              <td v-for="cell in row.getVisibleCells()" :key="cell.id" class="px-4 py-3">
                <!-- Role column: custom rendering -->
                <template v-if="cell.column.id === 'role'">
                  <template v-if="editingUserId === row.original.id">
                    <UiSelect v-model="editingRole" :options="roleOptions" size="sm" />
                  </template>
                  <template v-else>
                    <span
                      :class="[
                        roleColor[row.original.role],
                        'rounded-full px-2.5 py-1 text-xs font-semibold',
                      ]"
                    >
                      {{ row.original.role }}
                    </span>
                  </template>
                </template>
                <!-- Provider column -->
                <template v-else-if="cell.column.id === 'provider'">
                  <div class="flex items-center gap-1.5">
                    <span
                      :class="[
                        resolveIcon(
                          providerIconName[row.original.provider ?? 'credentials'] ?? 'lock',
                        ),
                        'text-surface-400 h-4 w-4',
                      ]"
                    />
                    <span>{{ row.original.provider ?? 'credentials' }}</span>
                  </div>
                </template>
                <!-- Verified column -->
                <template v-else-if="cell.column.id === 'emailVerified'">
                  <span
                    v-if="row.original.emailVerified"
                    :class="[resolveIcon('check-circle'), 'h-5 w-5 text-green-500']"
                  />
                  <span v-else :class="[resolveIcon('close-circle'), 'text-surface-300 h-5 w-5']" />
                </template>
                <!-- Default -->
                <template v-else>
                  <FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
                </template>
              </td>
              <!-- Actions -->
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <template v-if="editingUserId === row.original.id">
                    <UiButton variant="ghost" size="sm" @click="saveRole(row.original)">
                      {{ t('button_save') }}
                    </UiButton>
                    <UiButton variant="ghost" size="sm" @click="cancelEdit()">
                      {{ t('button_cancel') }}
                    </UiButton>
                  </template>
                  <template v-else-if="can('roles:assign')">
                    <UiButton variant="ghost" size="sm" @click="startEditRole(row.original)">
                      {{ t('users_change_role') }}
                    </UiButton>
                    <UiButton
                      v-if="can('users:update')"
                      variant="ghost"
                      size="sm"
                      @click="selectedUser = row.original"
                    >
                      {{ t('users_permissions') }}
                    </UiButton>
                  </template>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div
        class="border-surface-200 dark:border-surface-700 flex items-center justify-between border-t p-4"
      >
        <div class="flex items-center gap-2">
          <span class="text-surface-500 text-sm">{{ t('common_rows_per_page') }}:</span>
          <UiSelect
            :model-value="pagination.pageSize"
            :options="[5, 10, 20, 50].map((s) => ({ value: s, label: String(s) }))"
            size="sm"
            @update:model-value="onPageSizeChange"
          />
        </div>
        <div class="flex items-center gap-2">
          <UiButton
            variant="secondary"
            size="sm"
            :disabled="!table.getCanPreviousPage()"
            @click="table.previousPage()"
          >
            {{ t('common_previous') }}
          </UiButton>
          <span class="text-surface-600 dark:text-surface-300 text-sm font-medium tabular-nums">
            {{ currentPage }} / {{ pageCount }}
          </span>
          <UiButton
            variant="secondary"
            size="sm"
            :disabled="!table.getCanNextPage()"
            @click="table.nextPage()"
          >
            {{ t('common_next') }}
          </UiButton>
        </div>
      </div>
    </div>

    <!-- Permissions Matrix -->
    <div
      class="dark:bg-surface-800/90 border-surface-200 dark:border-surface-700 rounded-2xl border bg-white/90 p-6 shadow-sm"
    >
      <h2 class="text-surface-900 mb-4 text-xl font-bold dark:text-white">
        {{ t('users_permissions') }}
      </h2>
      <p class="text-surface-500 dark:text-surface-400 mb-4 text-sm">
        {{ t('users_permissions_desc') }}
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-surface-200 dark:border-surface-700 border-b">
              <th class="text-surface-600 dark:text-surface-300 px-3 py-2 text-left font-semibold">
                {{ t('users_col_permission') }}
              </th>
              <th
                v-for="roleDef in Object.values(ROLE_DEFINITIONS)"
                :key="roleDef.name"
                class="text-surface-600 dark:text-surface-300 px-3 py-2 text-center font-semibold"
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
              <td class="text-surface-600 dark:text-surface-300 px-3 py-2 text-sm">
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
