/**
 * A role the project defines, in the users module.
 *
 * The lists used to be `Object.values(ROLE_DEFINITIONS)`: six names, fixed
 * when the RBAC barrel was imported. They are read from the role definitions
 * now, so a role declared in `rbac.overrides.ts` is offered, filtered by,
 * listed and labelled without an edit to the module.
 */
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { FlexRender, type Table } from '@tanstack/vue-table'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { computed, defineComponent, h, type PropType } from 'vue'

import { UiSelect } from '@/components/ui'
import { resolveRolePermissions } from '@/lib/rbac'
import { resolveRbacOverrides } from '@/lib/rbac/overrides'
import type { RbacOverrides } from '@/lib/rbac/types'
import { installRbacConfig } from '@/lib/runtime'
import { getI18n } from '@/plugins/i18n'
import { useAuthStore } from '@/stores/auth'
import type { Role, User } from '@/types'

interface Declared {
  auditor: true
  billing_admin: true
  service_account: true
}

const PROJECT: RbacOverrides<Declared> = {
  roles: {
    // Labelled by a key of its own, as `<locale>.overrides.json` would hold it.
    auditor: { inherits: ['viewer'], labelKey: 'roles_auditor', label: 'Auditor (fallback)' },
    // No key anywhere: the plain label.
    billing_admin: { inherits: ['member'], label: 'Billing administrator' },
    // Held by integrations, never handed out from a picker.
    service_account: { inherits: [], assignable: false },
  },
  grants: { auditor: ['audit:read'], billing_admin: ['billing:manage'] },
}

const admin: User = {
  id: 'u-admin',
  name: 'Super Admin',
  email: 'admin@example.test',
  role: 'super_admin',
  emailVerified: true,
  provider: 'credentials',
}

const users: User[] = [
  admin,
  { id: 'u-aud', name: 'Ana Auditor', email: 'ana@example.test', role: 'auditor' as Role },
  {
    id: 'u-two',
    name: 'Two Roles',
    email: 'two@example.test',
    role: 'viewer',
    roles: ['viewer', 'billing_admin'] as Role[],
  },
]

const updatePermissions = vi.hoisted(() => vi.fn())

vi.mock('~/modules/users/composables/useUsersQuery', () => ({
  useUsersQuery: () => ({
    users: computed(() => users),
    meta: computed(() => ({ total: users.length, page: 1, pageSize: 5, totalPages: 1 })),
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

vi.mock('~/modules/users/composables/useUpdatePermissionsMutation', () => ({
  useUpdatePermissionsMutation: () => ({
    updatePermissions,
    isPending: computed(() => false),
    error: computed(() => null),
    reset: vi.fn(),
  }),
}))

import InviteUserDialog from '@/modules/users/components/InviteUserDialog.vue'
import RolePermissionMatrix from '@/modules/users/components/RolePermissionMatrix.vue'
import UserPermissionsPanel from '@/modules/users/components/UserPermissionsPanel.vue'
import UsersScreen from '@/modules/users/components/UsersScreen.vue'
import { roleBadgeClass, roleDefaultPermissions } from '@/modules/users/presentation'

interface Option {
  value: string
  label: string
}

const tables: Table<User>[] = []
const DataGridRows = defineComponent({
  name: 'DataGridRows',
  props: { table: { type: Object as PropType<Table<User>>, required: true } },
  setup(props) {
    tables.push(props.table)
    return () =>
      h(
        'div',
        props.table.getRowModel().rows.map((row) =>
          h(
            'div',
            { key: row.id, 'data-row-id': row.original.id },
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
  },
})

function mountScreen() {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().setAuth(admin, 'access-token')

  return mount(UsersScreen, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }], pinia],
      stubs: { UiDataGrid: DataGridRows, UserPermissionsPanel: true },
    },
  })
}

const i18n = getI18n().global

beforeEach(() => {
  setActivePinia(createPinia())
  installRbacConfig(resolveRbacOverrides<Declared>(PROJECT))
  // What the project put in `en.overrides.json` for the one role it keyed.
  i18n.mergeLocaleMessage('en', { roles_auditor: 'Auditor' })
  tables.length = 0
  updatePermissions.mockReset()
})

afterEach(() => {
  const messages = i18n.getLocaleMessage('en') as Record<string, unknown>
  delete messages.roles_auditor
  i18n.setLocaleMessage('en', messages as never)
})

describe('a project role in the users module', () => {
  it('is offered by the invite dialog, with its label, unless it is not assignable', () => {
    const options = mount(InviteUserDialog).findComponent(UiSelect).props('options') as Option[]

    expect(options).toEqual([
      { value: 'super_admin', label: 'Super admin' },
      { value: 'admin', label: 'Admin' },
      { value: 'manager', label: 'Manager' },
      { value: 'member', label: 'Member' },
      { value: 'viewer', label: 'Viewer' },
      { value: 'auditor', label: 'Auditor' },
      { value: 'billing_admin', label: 'Billing administrator' },
    ])
  })

  it('is offered by the inline role picker of the directory', async () => {
    const wrapper = mountScreen()

    const row = wrapper.find('[data-row-id="u-aud"]')
    const edit = row.findAll('button').find((button) => /role/i.test(button.text()))
    expect(edit, 'the row has a change-role control').toBeDefined()
    await edit!.trigger('click')

    const picker = wrapper.find('[data-row-id="u-aud"]').findComponent(UiSelect)
    expect(picker.props('modelValue')).toBe('auditor')
    expect((picker.props('options') as Option[]).map((option) => option.value)).toEqual([
      'super_admin',
      'admin',
      'manager',
      'member',
      'viewer',
      'guest',
      'auditor',
      'billing_admin',
    ])
  })

  it('can be filtered by even when a picker does not offer it', () => {
    mountScreen()

    const meta = tables[0]!.getColumn('role')!.columnDef.meta as { filter: { options: Option[] } }
    expect(meta.filter.options.slice(6)).toEqual([
      { value: 'auditor', label: 'Auditor' },
      { value: 'billing_admin', label: 'Billing administrator' },
      { value: 'service_account', label: 'Service account' },
    ])
  })

  it('is in the legend with what it holds, and labels the user who has it', () => {
    const wrapper = mountScreen()
    const badges = wrapper.findAll('span.rounded-full').map((badge) => badge.text())
    const count = (role: string) => resolveRolePermissions(role as Role).length

    expect(badges.map((text) => text.replaceAll(/\s+/g, ' ')).slice(6, 9)).toEqual([
      `Auditor · ${count('auditor')} permissions`,
      `Billing administrator · ${count('billing_admin')} permissions`,
      'Service account · 0 permissions',
    ])
    expect(count('auditor')).toBe(resolveRolePermissions('viewer').length + 1)
    // The row of the auditor shows the role's label, not `role_auditor`.
    expect(wrapper.find('[data-row-id="u-aud"]').text()).toContain('Auditor')
    expect(wrapper.text()).not.toContain('role_auditor')
  })

  it('has a column in the permission matrix', () => {
    const wrapper = mount(RolePermissionMatrix)

    const headers = wrapper.findAll('thead th').map((th) => th.text())
    expect(headers.slice(1)).toEqual([
      'Super admin',
      'Admin',
      'Manager',
      'Member',
      'Viewer',
      'Guest',
      'Auditor',
      'Billing administrator',
      'Service account',
    ])
  })

  it('gets the neutral tint, and the built-in roles keep theirs', () => {
    expect(roleBadgeClass('auditor' as Role)).toBe(roleBadgeClass('guest'))
    expect(roleBadgeClass('admin')).not.toBe(roleBadgeClass('guest'))
    expect(roleBadgeClass('__proto__' as Role)).toBe(roleBadgeClass('guest'))
  })
})

describe('a user with several roles in the permissions panel', () => {
  it('starts from what every role grants, not the primary one alone', async () => {
    const two = users[2]!
    const wrapper = mount(UserPermissionsPanel, { props: { user: two } })

    expect(roleDefaultPermissions(two)).toContain('billing:manage')
    expect(resolveRolePermissions('viewer')).not.toContain('billing:manage')

    updatePermissions.mockResolvedValue(two)
    const save = wrapper.findAll('button').find((button) => button.text() === 'Save')
    await save!.trigger('click')

    const sent = updatePermissions.mock.calls[0]![0] as { id: string; permissions: string[] }
    expect(sent.id).toBe('u-two')
    expect([...sent.permissions].sort()).toEqual([...roleDefaultPermissions(two)].sort())
    expect(sent.permissions).toContain('billing:manage')
  })
})
