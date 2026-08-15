/**
 * Inline role editing, with the feedback that belongs to it.
 *
 * Which row is being edited, what the pending role is, how a value coming out
 * of a `<select>` is narrowed, and what the user is told when the change fails
 * — one workflow, and none of it is about the URL. Extracted so a second place
 * that lets an admin change a role (a user drawer, a bulk action) cannot report
 * the same failure differently.
 */
import { useI18n } from 'vue-i18n'

import { useNotificationStore } from '~/stores/notification'
import type { Role, User } from '~/types'

import { useUpdateRoleMutation } from './useUpdateRoleMutation'

/** The role a freshly-opened editor starts on if the user somehow has none. */
const FALLBACK_ROLE: Role = 'member'

export function useUserRoleEditor() {
  const { t } = useI18n()
  const notifications = useNotificationStore()
  const { updateRole, isPending } = useUpdateRoleMutation()

  const editingUserId = ref<string | null>(null)
  const editingRole = ref<Role>(FALLBACK_ROLE)

  function isEditing(user: User): boolean {
    return editingUserId.value === user.id
  }

  function start(user: User) {
    editingUserId.value = user.id
    editingRole.value = user.role ?? FALLBACK_ROLE
  }

  function cancel() {
    editingUserId.value = null
  }

  /**
   * Narrow a value emitted by the role `<select>`.
   *
   * The control emits the widest type it supports (`string | number | array`).
   * Anything that is not a string is not a role, and is ignored rather than
   * cast into one.
   */
  function setRole(value: string | number | Array<string | number>) {
    const next = Array.isArray(value) ? value[0] : value
    if (typeof next === 'string') editingRole.value = next as Role
  }

  async function save(user: User) {
    const role = editingRole.value
    try {
      await updateRole(user.id, role)
      notifications.add({
        type: 'success',
        title: t('users_role_updated'),
        message: t('users_role_updated_detail', { name: user.name, role: t(`role_${role}`) }),
      })
    } catch {
      notifications.add({
        type: 'error',
        title: t('common_error'),
        message: t('users_role_update_failed'),
      })
    }
    // Closed either way: leaving the row in edit mode after a failure strands
    // the table in a state whose only exit is a control the user just used.
    editingUserId.value = null
  }

  return {
    editingUserId,
    editingRole,
    isEditing,
    start,
    cancel,
    setRole,
    save,
    isSaving: isPending,
  }
}
