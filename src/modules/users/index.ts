import type { ModuleDefinition } from '../types'
import usersI18nAr from './i18n/ar.json'
import usersI18nEn from './i18n/en.json'
import usersI18nFr from './i18n/fr.json'

/**
 * Users Module
 *
 * Demonstrates the server-state pattern for CRUD:
 *   - User list + detail are fetched with TanStack Query (no Pinia store)
 *   - Role mutations invalidate the query cache + emit typed events
 *   - Cross-module communication via appEvents (no direct store coupling)
 *
 * Public API (importable via barrel `~/modules/users`):
 *   - useUsers          — TanStack Query composable (list + role update)
 *   - usersModuleKeys   — typed query key factory
 *   - UserFilters, UserInvitePayload, UserRoleUpdatePayload — types
 */
const usersModule: ModuleDefinition = {
  config: {
    id: 'users',
    name: 'Users',
    description: 'Team member management, roles, and access control',
    version: '1.0.0',
    category: 'users',
    order: 20,
    enabledByDefault: true,
    permissions: ['users:read', 'users:manage'],
  },

  routes: [
    {
      path: '/dashboard/users',
      name: '/dashboard/users',
      component: () => import('./pages/users.vue'),
      meta: {
        layout: 'dashboard',
        requiresAuth: true,
        requiredPermission: 'users:read',
        module: 'users',
      },
    },
  ],

  navItems: [
    {
      label: 'users_nav',
      icon: 'users',
      to: '/dashboard/users',
      permission: 'users:read',
      order: 20,
    },
  ],

  i18n: {
    en: usersI18nEn,
    fr: usersI18nFr,
    ar: usersI18nAr,
  },
}

export default usersModule

// ─── Public API barrel ──────────────────────────────────
// Cross-module consumers MUST import from here.
export { useUsers } from './composables/useUsers'
export { useUsersQuery } from './composables/useUsersQuery'
export { useUpdateRoleMutation } from './composables/useUpdateRoleMutation'
export { usersModuleKeys } from './query-keys'
export type { UserFilters, UserInvitePayload, UserRoleUpdatePayload } from './types'
