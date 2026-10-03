import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'

import { parseUser, type UserInput } from '~/lib/auth/user'
import { AppError } from '~/lib/errors'
import { resolveSubjectPermissions, resolveSubjectRoles } from '~/lib/rbac/identity'
import { resolveRolePermissions } from '~/lib/rbac/inheritance'
import { resolveRbacOverrides } from '~/lib/rbac/overrides'
import type { Role } from '~/lib/rbac/types'
import { installRbacConfig } from '~/lib/runtime'

import { captureLogged } from '../../utils/logged'

/**
 * A user that arrives with several roles.
 *
 * `role` stays what it was: the one role to show, and the one single-role code
 * reads. `roles` is new, and it is passed through as the backend sent it,
 * because a backend could already send anything under that name and its users
 * signed in. What it grants is decided by the RBAC layer, which reads it
 * defensively.
 */

const base = { id: 'u1', email: 'ada@example.test', name: 'Ada' }

let logged: ReturnType<typeof captureLogged>

beforeEach(() => {
  installRbacConfig(
    resolveRbacOverrides<{ auditor: true }>({
      roles: { auditor: { inherits: ['viewer'] } },
      grants: { auditor: ['audit:read'] },
    }),
  )
  logged = captureLogged()
})

afterEach(() => {
  logged.restore()
})

describe('a user with `role` and `roles`', () => {
  it('keeps both as sent', () => {
    const parsed = parseUser({ ...base, role: 'viewer', roles: ['viewer', 'manager'] })

    expect(parsed).toEqual({ ...base, role: 'viewer', roles: ['viewer', 'manager'] })
    expect(resolveSubjectRoles(parsed)).toEqual(['viewer', 'manager'])
    expect(resolveSubjectPermissions(parsed)).toEqual(resolveRolePermissions('manager'))
  })

  it('keeps names the app does not have in `roles`; they grant nothing', () => {
    const parsed = parseUser({ ...base, role: 'viewer', roles: ['viewer', 'root', 'auditor'] })

    expect(parsed.roles).toEqual(['viewer', 'root', 'auditor'])
    expect(resolveSubjectRoles(parsed)).toEqual(['viewer', 'auditor'])
  })
})

describe('a user with `roles` alone', () => {
  it('gets a `role`: the first of them no other inherits from', () => {
    expect(parseUser({ ...base, roles: ['viewer', 'manager'] })).toEqual({
      ...base,
      role: 'manager',
      roles: ['viewer', 'manager'],
    })
    expect(parseUser({ ...base, roles: ['auditor', 'member'] }).role).toBe('auditor')
    expect(parseUser({ ...base, roles: ['member'] }).role).toBe('member')
  })

  it('gets one from the roles the app has, past the ones it does not', () => {
    expect(parseUser({ ...base, roles: ['root', 'auditor', 'wheel'] }).role).toBe('auditor')
  })

  it('stays without a role when the app has none of them', () => {
    const parsed = parseUser({ ...base, roles: ['root', 'wheel'] })

    expect(parsed).toEqual({ ...base, roles: ['root', 'wheel'] })
    expect(parsed).not.toHaveProperty('role')
    expect(resolveSubjectPermissions(parsed)).toEqual([])
  })

  it('is settled the same when `role` came as null or empty', () => {
    expect(parseUser({ ...base, role: null, roles: ['manager'] }).role).toBe('manager')
    expect(parseUser({ ...base, role: '', roles: ['manager'] }).role).toBe('manager')
  })
})

describe('a `role` the app does not have', () => {
  it('gives way to the primary of the roles it does have', () => {
    expect(parseUser({ ...base, role: 'owner', roles: ['viewer', 'admin'] })).toEqual({
      ...base,
      role: 'admin',
      roles: ['viewer', 'admin'],
    })
  })

  it('is kept as named when there is nothing better, as it always was', () => {
    expect(parseUser({ ...base, role: 'owner' }).role).toBe('owner')
    expect(parseUser({ ...base, role: 'owner', roles: ['root'] }).role).toBe('owner')
  })
})

describe('a `roles` that is not a list of names', () => {
  // Before `roles` was read, the field was any other unknown field: the user
  // signed in and the app ignored it. A release must not end those sign-ins,
  // and must not start granting anything from them either.
  it.each([
    ['role objects', [{ id: 1, name: 'admin' }]],
    ['a string', 'admin'],
    ['an object', { admin: true }],
    ['a number', 3],
    ['numbers', [1, 2]],
    ['null', null],
  ])('still signs the user in, with %s kept as sent and granting nothing', (_case, roles) => {
    const parsed = parseUser({ ...base, role: 'viewer', roles } as unknown as UserInput)

    expect(parsed.role).toBe('viewer')
    expect(parsed.roles).toEqual(roles)
    expect(resolveSubjectRoles(parsed)).toEqual(['viewer'])
    expect(resolveSubjectPermissions(parsed)).toEqual(resolveRolePermissions('viewer'))
  })

  it('gives no role to a user who has only that', () => {
    const parsed = parseUser({ ...base, roles: [{ name: 'super_admin' }] } as unknown as UserInput)

    expect(parsed).not.toHaveProperty('role')
    expect(resolveSubjectPermissions(parsed)).toEqual([])
  })
})

describe('what did not change', () => {
  it('a user with one role has no `roles` afterwards', () => {
    const parsed = parseUser({ ...base, role: 'manager' })

    expect(parsed).toEqual({ ...base, role: 'manager' })
    expect(parsed).not.toHaveProperty('roles')
  })

  it('a `role` that is an array is still refused: several roles go in `roles`', () => {
    expect(() => parseUser({ ...base, role: ['admin'] as unknown as Role })).toThrow(AppError)
  })

  it('a mapper may return roles without a cast', () => {
    const mapped: UserInput = { id: 7, email: 'a@example.test', roles: ['viewer', 'auditor'] }

    expect(parseUser(mapped).role).toBe('auditor')
  })
})
