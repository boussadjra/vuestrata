import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { nextTick } from 'vue'

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

/**
 * Locate a permission's toggle by its `data-permission` hook.
 *
 * Not by label text: the panel renders `permLabel(perm)`, which is translated
 * copy ("View users"), never the raw `users:read` token. Matching on text also
 * ties the test to the active locale and to the wording of the catalog, so a
 * copy edit would break it for no good reason.
 */
function permissionToggle(wrapper: VueWrapper, permission: Permission) {
  const label = wrapper.find(`[data-permission="${permission}"]`)
  if (!label.exists()) throw new Error(`Permission row not found: ${permission}`)
  return label.find<HTMLElement>('[role="checkbox"]')
}

/**
 * Open the role select and choose an option.
 *
 * The listbox is rendered through Reka's `SelectPortal`, which teleports it to
 * `document.body` — outside the wrapper's subtree. `wrapper.findAll` therefore
 * never sees the options no matter how long you wait; they have to be queried
 * from the document.
 */
async function selectRole(wrapper: VueWrapper, label: string) {
  const trigger = wrapper.find('#invite-role')
  // Reka opens the listbox on pointerdown. No event init here: VTU assigns the
  // given keys onto the constructed event, and `button` is getter-only on
  // MouseEvent — jsdom already defaults it to 0, which is what Reka checks for.
  await trigger.trigger('pointerdown')
  await trigger.trigger('click')
  await nextTick()

  const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')]
  const option = options.find((candidate) => candidate.textContent?.trim() === label)
  if (!option) {
    throw new Error(
      `Role option not found: ${label}. Found: ${options.map((o) => o.textContent?.trim()).join(', ') || '(none)'}`,
    )
  }

  // Reka's SelectItem commits on pointerup, not click. jsdom has no
  // PointerEvent constructor, but the listeners are registered by event type,
  // so a MouseEvent named 'pointerup' is dispatched and handled identically.
  option.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
  option.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }))
  option.click()
  await nextTick()
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
    await selectRole(wrapper, 'Viewer')
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

    expect(wrapper.findAll('[data-ui="checkbox"]')).toHaveLength(getRegisteredPermissions().size)
  })

  it('pre-checks explicit permissions over role defaults', () => {
    const user = createAuthTestUser({
      role: 'viewer',
      permissions: ['users:read'],
    })
    const wrapper = mountPanel(user)

    expect(permissionToggle(wrapper, 'users:read').attributes('aria-checked')).toBe('true')
    expect(permissionToggle(wrapper, 'reports:read').attributes('aria-checked')).toBe('false')
  })

  it('falls back to role default permissions when explicit permissions are absent', () => {
    const user = createAuthTestUser({ role: 'viewer', permissions: undefined })
    const wrapper = mountPanel(user)

    for (const permission of getRolePermissions('viewer')) {
      expect(permissionToggle(wrapper, permission).attributes('aria-checked')).toBe('true')
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
    // Located by data-permission, not label text: the row renders translated
    // copy, so `users:read` never appears in it.
    const usersReadLabel = wrapper.find('[data-permission="users:read"]')
    expect(usersReadLabel.exists()).toBe(true)
    expect(usersReadLabel.classes()).toContain('cursor-not-allowed')
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

    expect(permissionToggle(wrapper, 'audit:read').attributes('aria-checked')).toBe('false')
    for (const permission of getRolePermissions('member')) {
      expect(permissionToggle(wrapper, permission).attributes('aria-checked')).toBe('true')
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

    await permissionToggle(wrapper, 'settings:read').trigger('click')
    const saveButton = wrapper.findAll('button').find((button) => button.text() === 'Save')
    await saveButton!.trigger('click')

    expect(mutationMocks.updatePermissions).toHaveBeenCalledWith({
      id: 'target',
      permissions: expect.arrayContaining(['users:read', 'settings:read']),
    })
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
