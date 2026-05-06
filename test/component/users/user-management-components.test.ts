import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { getRegisteredPermissions, getRolePermissions } from '@/lib/rbac'
import InviteUserDialog from '@/modules/users/components/InviteUserDialog.vue'
import UserPermissionsPanel from '@/modules/users/components/UserPermissionsPanel.vue'
import { useAuthStore } from '@/stores/auth'
import type { Permission, User } from '@/types'

import { ALL_TEST_PERMISSIONS, createAuthTestUser } from '../../utils/auth-test-helpers'

const mutationMocks = vi.hoisted(() => ({
  inviteUser: vi.fn(),
  updatePermissions: vi.fn(),
}))

vi.mock('@/modules/users/composables/useInviteUserMutation', async () => {
  const { ref } = await import('vue')
  return {
    useInviteUserMutation: () => ({
      inviteUser: mutationMocks.inviteUser,
      isPending: ref(false),
      error: ref(null),
      reset: vi.fn(),
    }),
  }
})

vi.mock('@/modules/users/composables/useUpdatePermissionsMutation', async () => {
  const { ref } = await import('vue')
  return {
    useUpdatePermissionsMutation: () => ({
      updatePermissions: mutationMocks.updatePermissions,
      isPending: ref(false),
      error: ref(null),
      reset: vi.fn(),
    }),
  }
})

function permissionInput(wrapper: VueWrapper, permission: Permission) {
  const label = wrapper.findAll('label').find((candidate) => candidate.text().includes(permission))
  if (!label) throw new Error(`Permission label not found: ${permission}`)
  return label.find<HTMLInputElement>('input[type="checkbox"]')
}

beforeEach(() => {
  setActivePinia(createPinia())
  mutationMocks.inviteUser.mockReset()
  mutationMocks.updatePermissions.mockReset()
})

describe('InviteUserDialog', () => {
  it('shows inline validation errors for invalid input', async () => {
    const wrapper = mount(InviteUserDialog)

    await wrapper.find('form').trigger('submit.prevent')

    expect(wrapper.text()).toContain('A valid email address is required.')
    expect(wrapper.text()).toContain('Name is required.')
    expect(mutationMocks.inviteUser).not.toHaveBeenCalled()
  })

  it('submits a valid invite payload and closes on success', async () => {
    mutationMocks.inviteUser.mockResolvedValue(
      createAuthTestUser({ email: 'new@example.test', name: 'New User', role: 'viewer' }),
    )
    const wrapper = mount(InviteUserDialog)

    await wrapper.find('#invite-email').setValue('new@example.test')
    await wrapper.find('#invite-name').setValue('New User')
    await wrapper.find('#invite-role').setValue('viewer')
    await wrapper.find('form').trigger('submit.prevent')

    expect(mutationMocks.inviteUser).toHaveBeenCalledWith({
      email: 'new@example.test',
      name: 'New User',
      role: 'viewer',
    })
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('renders server errors without closing', async () => {
    mutationMocks.inviteUser.mockRejectedValue(new Error('Email already exists'))
    const wrapper = mount(InviteUserDialog)

    await wrapper.find('#invite-email').setValue('demo@vuestrata.dev')
    await wrapper.find('#invite-name').setValue('Duplicate')
    await wrapper.find('form').trigger('submit.prevent')

    expect(wrapper.text()).toContain('Email already exists')
    expect(wrapper.emitted('close')).toBeUndefined()
  })
})

describe('UserPermissionsPanel', () => {
  function mountPanel(user: User, currentUser: User = user) {
    const auth = useAuthStore()
    auth.setAuth(currentUser, 'access', 'refresh')
    return mount(UserPermissionsPanel, { props: { user } })
  }

  it('renders a checkbox for every registered permission', () => {
    const wrapper = mountPanel(createAuthTestUser({ role: 'member' }))

    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(getRegisteredPermissions().size)
  })

  it('pre-checks explicit permissions over role defaults', () => {
    const user = createAuthTestUser({
      role: 'viewer',
      permissions: ['users:read'],
    })
    const wrapper = mountPanel(user)

    expect(permissionInput(wrapper, 'users:read').element.checked).toBe(true)
    expect(permissionInput(wrapper, 'reports:read').element.checked).toBe(false)
  })

  it('falls back to role default permissions when explicit permissions are absent', () => {
    const user = createAuthTestUser({ role: 'viewer', permissions: undefined })
    const wrapper = mountPanel(user)

    for (const permission of getRolePermissions('viewer')) {
      expect(permissionInput(wrapper, permission).element.checked).toBe(true)
    }
  })

  it('shows a self-edit warning and disables users:read for the current user', () => {
    const user = createAuthTestUser({
      id: 'self',
      role: 'super_admin',
      permissions: ALL_TEST_PERMISSIONS,
    })
    const wrapper = mountPanel(user)

    expect(wrapper.text()).toContain('You are editing your own account')
    const usersReadLabel = wrapper
      .findAll('label')
      .find((candidate) => candidate.text().includes('users:read'))
    expect(usersReadLabel?.classes()).toContain('cursor-not-allowed')
  })

  it('reset button restores role defaults', async () => {
    const user = createAuthTestUser({
      role: 'member',
      permissions: ['users:read', 'audit:read'],
    })
    const wrapper = mountPanel(user)

    const resetButton = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Reset to role defaults')
    await resetButton!.trigger('click')

    expect(permissionInput(wrapper, 'audit:read').element.checked).toBe(false)
    for (const permission of getRolePermissions('member')) {
      expect(permissionInput(wrapper, permission).element.checked).toBe(true)
    }
  })

  it('submits the selected permissions and closes on success', async () => {
    const user = createAuthTestUser({
      id: 'target',
      role: 'member',
      permissions: ['users:read'],
    })
    const currentUser = createAuthTestUser({
      id: 'admin',
      role: 'super_admin',
      permissions: ALL_TEST_PERMISSIONS,
    })
    mutationMocks.updatePermissions.mockResolvedValue(user)
    const wrapper = mountPanel(user, currentUser)

    await permissionInput(wrapper, 'settings:read').setValue(true)
    const saveButton = wrapper.findAll('button').find((button) => button.text() === 'Save')
    await saveButton!.trigger('click')

    expect(mutationMocks.updatePermissions).toHaveBeenCalledWith({
      id: 'target',
      permissions: expect.arrayContaining(['users:read', 'settings:read']),
    })
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
