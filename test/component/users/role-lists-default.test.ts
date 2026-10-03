/**
 * The role lists of the users module, in a project that declares no role.
 *
 * Written before the lists were read from the role definitions, and not to be
 * edited afterwards: the picker, the filter, the legend and the matrix must
 * show a project with no role of its own exactly what they showed before.
 */
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import type { Table } from '@tanstack/vue-table'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { computed, defineComponent, h, type PropType } from 'vue'

import { UiSelect } from '@/components/ui'
import { resolveRbacOverrides } from '@/lib/rbac/overrides'
import { installRbacConfig } from '@/lib/runtime'
import { useAuthStore } from '@/stores/auth'
import type { User } from '@/types'

const admin: User = {
  id: 'u-admin',
  name: 'Super Admin',
  email: 'admin@example.test',
  role: 'super_admin',
  emailVerified: true,
  provider: 'credentials',
}

vi.mock('~/modules/users/composables/useUsersQuery', () => ({
  useUsersQuery: () => ({
    users: computed(() => [admin]),
    meta: computed(() => ({ total: 1, page: 1, pageSize: 5, totalPages: 1 })),
    isLoading: computed(() => false),
    isFetching: computed(() => false),
    error: computed(() => null),
    refetch: vi.fn(),
  }),
}))

vi.mock('~/modules/users/composables/useUpdateRoleMutation', () => ({
  useUpdateRoleMutation: () => ({
    updateRole: vi.fn().mockResolvedValue(undefined),
    isPending: computed(() => false),
    error: computed(() => null),
  }),
}))

vi.mock('~/modules/users/composables/useInviteUserMutation', () => ({
  useInviteUserMutation: () => ({
    inviteUser: vi.fn().mockResolvedValue({}),
    isPending: computed(() => false),
    error: computed(() => null),
    reset: vi.fn(),
  }),
}))

import InviteUserDialog from '@/modules/users/components/InviteUserDialog.vue'
import UsersScreen from '@/modules/users/components/UsersScreen.vue'
import { matrixRoles } from '@/modules/users/presentation'

interface Option {
  value: string
  label: string
}

/** Hands the test the table the screen built, and renders nothing of it. */
const tables: Table<User>[] = []
const DataGridProbe = defineComponent({
  name: 'DataGridProbe',
  props: { table: { type: Object as PropType<Table<User>>, required: true } },
  setup(props) {
    tables.push(props.table)
    return () => h('div')
  },
})

function mountScreen() {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().setAuth(admin, 'access-token')

  return mount(UsersScreen, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }], pinia],
      stubs: { UiDataGrid: DataGridProbe, UserPermissionsPanel: true },
    },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  // The seam as shipped: empty, whatever this project has put in it since.
  installRbacConfig(resolveRbacOverrides({}))
  tables.length = 0
})

describe('the role lists with no project role declared', () => {
  it('offers every role but guest in the invite dialog', () => {
    const wrapper = mount(InviteUserDialog)

    expect(wrapper.findComponent(UiSelect).props('options')).toEqual([
      { value: 'super_admin', label: 'Super admin' },
      { value: 'admin', label: 'Admin' },
      { value: 'manager', label: 'Manager' },
      { value: 'member', label: 'Member' },
      { value: 'viewer', label: 'Viewer' },
    ])
  })

  it('filters the directory by the six roles', () => {
    mountScreen()

    const meta = tables[0]!.getColumn('role')!.columnDef.meta as {
      filter: { options: Option[] }
    }
    expect(meta.filter.options).toEqual([
      { value: 'super_admin', label: 'Super admin' },
      { value: 'admin', label: 'Admin' },
      { value: 'manager', label: 'Manager' },
      { value: 'member', label: 'Member' },
      { value: 'viewer', label: 'Viewer' },
      { value: 'guest', label: 'Guest' },
    ])
  })

  it('lists the six roles in the legend, each with what it holds', () => {
    const wrapper = mountScreen()

    const legend = wrapper
      .findAll('span.rounded-full')
      .map((badge) => badge.text().replaceAll(/\s+/g, ' '))
    expect(legend).toEqual([
      'Super admin · 28 permissions',
      'Admin · 27 permissions',
      'Manager · 23 permissions',
      'Member · 12 permissions',
      'Viewer · 8 permissions',
      'Guest · 1 permissions',
    ])
  })

  it('gives the permission matrix one column per role', () => {
    expect(matrixRoles().map((role) => role.name)).toEqual([
      'super_admin',
      'admin',
      'manager',
      'member',
      'viewer',
      'guest',
    ])
  })
})
