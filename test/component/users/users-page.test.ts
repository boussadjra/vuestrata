/**
 * Component tests for the Users page.
 * Tests invite dialog and permissions panel interaction.
 */
import 'fake-indexeddb/auto'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vite-plus/test'
import { createI18n } from 'vue-i18n'
import { createRouter, createMemoryHistory } from 'vue-router'

import UsersPage from '@/modules/users/pages/users.vue'
import { useAuthStore } from '@/stores/auth'
import type { User } from '@/types'

// Minimal i18n for t() calls used in the template
const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      users_title: 'Users',
      users_subtitle: 'Manage team members',
      users_invite: 'Invite',
      users_search: 'Search',
      users_total: 'total',
      users_loading: 'Loading…',
      users_col_name: 'Name',
      users_col_email: 'Email',
      users_col_role: 'Role',
      users_col_provider: 'Provider',
      users_col_verified: 'Verified',
      users_col_last_login: 'Last Login',
      users_col_actions: 'Actions',
      users_col_permission: 'Permission',
      users_change_role: 'Change Role',
      users_role_updated: 'Role updated',
      users_role_update_failed: 'Update failed',
      users_permissions: 'Permissions',
      users_permissions_desc: 'Permissions matrix',
      common_yes: 'Yes',
      common_no: 'No',
      common_selected: 'selected',
      common_page_of: '{current}/{total}',
      common_rows_per_page: 'Rows',
      common_previous: 'Previous',
      common_next: 'Next',
      common_error: 'Error',
      button_save: 'Save',
      button_cancel: 'Cancel',
    },
  },
})

const mockSuperAdmin: User = {
  id: 'u-admin',
  name: 'Super Admin',
  email: 'demo@vuestrata.dev',
  role: 'super_admin',
  permissions: [
    'users:read',
    'users:create',
    'users:update',
    'users:delete',
    'roles:read',
    'roles:assign',
    'billing:read',
    'billing:manage',
    'dashboard:read',
    'dashboard:export',
    'settings:read',
    'settings:update',
    'reports:read',
    'reports:create',
    'reports:export',
    'audit:read',
  ],
  emailVerified: true,
  provider: 'credentials',
  lastLoginAt: new Date().toISOString(),
}

const mockUsers: User[] = [
  mockSuperAdmin,
  {
    id: 'u-member',
    name: 'Alice Member',
    email: 'alice@example.com',
    role: 'member',
    permissions: ['users:read', 'dashboard:read', 'settings:read'],
    emailVerified: true,
    provider: 'credentials',
    lastLoginAt: new Date().toISOString(),
  },
]

// Mock the users query to avoid actual API calls
vi.mock('~/modules/users', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/modules/users')>()
  return {
    ...actual,
    useUsersQuery: () => ({
      users: computed(() => mockUsers),
      isLoading: computed(() => false),
      total: computed(() => mockUsers.length),
    }),
    useUpdateRoleMutation: () => ({
      updateRole: vi.fn().mockResolvedValue(undefined),
      isPending: computed(() => false),
    }),
    useInviteUserMutation: () => ({
      inviteUser: vi.fn().mockResolvedValue(mockUsers[1]),
      isPending: computed(() => false),
      error: computed(() => null),
      reset: vi.fn(),
    }),
    useUpdatePermissionsMutation: () => ({
      updatePermissions: vi.fn().mockResolvedValue(mockUsers[1]),
      isPending: computed(() => false),
      error: computed(() => null),
      reset: vi.fn(),
    }),
  }
})

function mountPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: UsersPage }],
  })
  const pinia = createPinia()

  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.setAuth(mockSuperAdmin, 'tok', 'rtok')

  return mount(UsersPage, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }], router, i18n, pinia],
    },
  })
}

describe('Users Page — invite dialog', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    const g = globalThis as Record<string, unknown>
    delete g['__vuestrataDemoPersistence']
    delete g['__vuestrataDemoStorage']
  })

  it('invite button is visible for super_admin', () => {
    const wrapper = mountPage()
    const button = wrapper.findAll('button').find((b) => b.text().includes('Invite'))
    expect(button?.exists()).toBe(true)
  })

  it('clicking invite button shows InviteUserDialog', async () => {
    const wrapper = mountPage()
    const button = wrapper.findAll('button').find((b) => b.text().includes('Invite'))
    await button!.trigger('click')
    expect(wrapper.find('[aria-labelledby="invite-dialog-title"]').exists()).toBe(true)
  })

  it('InviteUserDialog closes on cancel', async () => {
    const wrapper = mountPage()
    const button = wrapper.findAll('button').find((b) => b.text().includes('Invite'))
    await button!.trigger('click')
    const cancelBtn = wrapper.findAll('button').find((b) => b.text() === 'Cancel')
    await cancelBtn!.trigger('click')
    expect(wrapper.find('[aria-labelledby="invite-dialog-title"]').exists()).toBe(false)
  })
})

describe('Users Page — permissions panel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    const g = globalThis as Record<string, unknown>
    delete g['__vuestrataDemoPersistence']
    delete g['__vuestrataDemoStorage']
  })

  it('Permissions button appears in actions column (super_admin can see it)', () => {
    const wrapper = mountPage()
    const permButtons = wrapper.findAll('button').filter((b) => b.text() === 'Permissions')
    expect(permButtons.length).toBeGreaterThan(0)
  })

  it('clicking Permissions button opens UserPermissionsPanel', async () => {
    const wrapper = mountPage()
    const permButton = wrapper.findAll('button').find((b) => b.text() === 'Permissions')
    await permButton!.trigger('click')
    expect(wrapper.find('[aria-labelledby="permissions-panel-title"]').exists()).toBe(true)
  })

  it('UserPermissionsPanel closes on Cancel', async () => {
    const wrapper = mountPage()
    const permButton = wrapper.findAll('button').find((b) => b.text() === 'Permissions')
    await permButton!.trigger('click')
    const cancelBtn = wrapper.findAll('button').find((b) => b.text() === 'Cancel')
    await cancelBtn!.trigger('click')
    expect(wrapper.find('[aria-labelledby="permissions-panel-title"]').exists()).toBe(false)
  })
})
