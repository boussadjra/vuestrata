/**
 * Component tests for the Users page.
 * Tests invite dialog and permissions panel interaction.
 */
import 'fake-indexeddb/auto'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { FlexRender, type Table } from '@tanstack/vue-table'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vite-plus/test'
import { computed, defineComponent, h, nextTick, type PropType } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'

// UsersPage import moved below so we can mock its child composables first.
import { useAuthStore } from '@/stores/auth'
import type { User } from '@/types'

const UiDataGridStub = defineComponent({
  name: 'UiDataGridStub',
  props: {
    table: {
      type: Object as PropType<Table<User>>,
      required: true,
    },
    loading: {
      type: Boolean,
      default: false,
    },
  },
  setup(props) {
    return () => {
      if (props.loading) {
        return h('div', { 'data-ui': 'data-grid-stub' }, 'Loading')
      }

      return h(
        'div',
        { 'data-ui': 'data-grid-stub' },
        props.table.getRowModel().rows.map((row) =>
          h(
            'div',
            { key: row.id, 'data-row-id': row.id },
            row.getVisibleCells().map((cell) =>
              h(FlexRender, {
                key: cell.id,
                render: cell.column.columnDef.cell,
                props: cell.getContext(),
              }),
            ),
          ),
        ),
      )
    }
  },
})

const UserPermissionsPanelStub = defineComponent({
  name: 'UserPermissionsPanelStub',
  emits: ['close'],
  setup(_, { emit }) {
    return () =>
      h('div', { 'aria-labelledby': 'permissions-panel-title' }, [
        h('h2', { id: 'permissions-panel-title' }, 'Permissions'),
        h(
          'button',
          {
            type: 'button',
            onClick: () => emit('close'),
          },
          'Cancel',
        ),
      ])
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
      meta: computed(() => ({
        total: mockUsers.length,
        page: 1,
        pageSize: 5,
        totalPages: 1,
      })),
      isLoading: computed(() => false),
      isFetching: computed(() => false),
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

// Mock composables used directly by child components (InviteUserDialog, UserPermissionsPanel)
vi.mock('~/modules/users/composables/useInviteUserMutation', () => ({
  useInviteUserMutation: () => ({
    inviteUser: vi.fn().mockResolvedValue({}),
    isPending: computed(() => false),
    error: computed(() => null),
    reset: vi.fn(),
  }),
}))

vi.mock('~/modules/users/composables/useUpdatePermissionsMutation', () => ({
  useUpdatePermissionsMutation: () => ({
    updatePermissions: vi.fn().mockResolvedValue({}),
    isPending: computed(() => false),
    error: computed(() => null),
    reset: vi.fn(),
  }),
}))

import UsersPage from '@/modules/users/pages/users.vue'

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
      plugins: [[VueQueryPlugin, { queryClient }], router, pinia],
      stubs: {
        UiDataGrid: UiDataGridStub,
        UserPermissionsPanel: UserPermissionsPanelStub,
      },
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

  it('permissions panel is hidden by default', () => {
    const wrapper = mountPage()
    expect(wrapper.find('[aria-labelledby="permissions-panel-title"]').exists()).toBe(false)
  })

  it('selecting a user opens UserPermissionsPanel', async () => {
    const wrapper = mountPage()
    ;(wrapper.vm as unknown as { selectedUser: User | null }).selectedUser = mockUsers[1]!
    await nextTick()
    expect(wrapper.find('[aria-labelledby="permissions-panel-title"]').exists()).toBe(true)
  })

  it('UserPermissionsPanel closes on Cancel', async () => {
    const wrapper = mountPage()
    ;(wrapper.vm as unknown as { selectedUser: User | null }).selectedUser = mockUsers[1]!
    await nextTick()
    const cancelBtn = wrapper.findAll('button').find((b) => b.text() === 'Cancel')
    await cancelBtn!.trigger('click')
    expect(wrapper.find('[aria-labelledby="permissions-panel-title"]').exists()).toBe(false)
  })
})
