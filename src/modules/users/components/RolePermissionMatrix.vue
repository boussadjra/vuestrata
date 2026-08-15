<script setup lang="ts">
/**
 * Which role holds which permission.
 *
 * A reference table, not a control: it answers "why can this person do that"
 * without anyone having to read `inheritance.ts`. The grid is derived from the
 * RBAC registry, so a permission added by a module appears here with no edit.
 */
import { useI18n } from 'vue-i18n'

import { usePermissionLabels } from '@/composables/usePermissionLabels'
import { resolveIcon } from '@/config/icon-provider'

import { matrixPermissions, matrixRoles } from '../presentation'

const { t } = useI18n()
const { permLabel } = usePermissionLabels()

const roles = matrixRoles()
const permissions = matrixPermissions()
</script>

<template>
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
              v-for="roleDef in roles"
              :key="roleDef.name"
              class="text-muted-foreground px-3 py-2 text-center font-semibold"
            >
              {{ t(`role_${roleDef.name}`) }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="perm in permissions"
            :key="perm"
            class="border-surface-100 dark:border-surface-800 border-b"
          >
            <td class="text-muted-foreground px-3 py-2 text-sm">
              {{ permLabel(perm) }}
            </td>
            <td v-for="roleDef in roles" :key="roleDef.name" class="px-3 py-2 text-center">
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
</template>
