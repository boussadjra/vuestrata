import { tryGetRbacConfig, type RbacConfig } from '~/lib/runtime'

import { BUILTIN_ROLES, includedRoles } from './role-graph'
import type { BuiltinRole, Role, Permission, RoleDefinition } from './types'

// ─── Role Hierarchy ───────────────────────────────────────

/**
 * The built-in roles, highest first. A project's own roles are not in it: they
 * have no position, only what they inherit from (see `role-graph.ts`).
 */
export const ROLE_HIERARCHY: Role[] = [...BUILTIN_ROLES]

// ─── Delta-Based Role Definitions ─────────────────────────
// Each role lists only the permissions it adds beyond its parent in the hierarchy.

const ROLE_DELTA_DEFINITIONS: Record<
  BuiltinRole,
  { label: string; description: string; delta: Permission[] }
> = {
  guest: {
    label: 'Guest',
    description: 'Limited access for external collaborators',
    delta: ['dashboard:read'],
  },
  viewer: {
    label: 'Viewer',
    description: 'Read-only access to dashboards and reports',
    // A viewer can look at every operational area but change none of it. The
    // read/manage split, rather than one permission per module, is what makes
    // the difference between viewer and manager visible in the UI: the same
    // pages load, the write actions are simply absent.
    delta: [
      'reports:read',
      'customers:read',
      'orders:read',
      'catalog:read',
      'projects:read',
      'calendar:read',
      'team:read',
    ],
  },
  member: {
    label: 'Member',
    description: 'Standard team member',
    delta: ['users:read', 'settings:read', 'messages:read', 'calendar:manage'],
  },
  manager: {
    label: 'Manager',
    description: 'Team manager with reporting and user management',
    delta: [
      'users:create',
      'users:update',
      'roles:read',
      'billing:read',
      'dashboard:export',
      'reports:create',
      'reports:export',
      'customers:manage',
      'orders:manage',
      'catalog:manage',
      'projects:manage',
    ],
  },
  admin: {
    label: 'Admin',
    description: 'Organization admin with broad access',
    delta: ['roles:assign', 'billing:manage', 'settings:update', 'audit:read'],
  },
  super_admin: {
    label: 'Super Admin',
    description: 'Full system access with no restrictions',
    delta: ['users:delete'],
  },
}

/** The delta of a built-in role; a project role has none, only its grants. */
function builtinDelta(role: Role): readonly Permission[] {
  return Object.hasOwn(ROLE_DELTA_DEFINITIONS, role)
    ? ROLE_DELTA_DEFINITIONS[role as BuiltinRole].delta
    : []
}

/**
 * Resolve the full permission set for a role: its own delta and grants, and
 * those of every role it inherits from. For a built-in role that is the walk
 * from guest up to it; for a project role, whatever its `inherits` leads to.
 *
 * The project's grants accumulate the same way, and its withdrawn permissions
 * come off last, so a withdrawal wins over a grant. A name that is not a role
 * (unknown, or a project role whose definition was rejected) holds nothing.
 * `config` defaults to the installed one; it is a parameter so the app layer
 * can resolve the seed set at import, before bootstrap has installed anything.
 */
export function resolveRolePermissions(
  role: Role,
  config: RbacConfig | null = tryGetRbacConfig(),
): Permission[] {
  const included = includedRoles(role, config)
  if (included.length === 0) return []

  const permSet = new Set<string>()
  const grants = config?.grants ?? {}

  // From the furthest ancestor (guest, for a built-in role) up to the role itself
  for (let i = included.length - 1; i >= 0; i--) {
    const r = included[i]!
    for (const perm of builtinDelta(r)) {
      permSet.add(perm)
    }
    for (const perm of (Object.hasOwn(grants, r) ? grants[r] : undefined) ?? []) {
      permSet.add(perm)
    }
  }

  for (const perm of config?.withdrawn ?? []) {
    permSet.delete(perm)
  }

  return [...permSet] as Permission[]
}

/**
 * Build full RoleDefinition objects from delta definitions, for the built-in
 * roles. `getRoleDefinitions()` in `roles.ts` lists the project's as well.
 *
 * `permissions` is read live rather than captured: `ROLE_DEFINITIONS` is built
 * when the RBAC barrel is first imported, which is before bootstrap installs the
 * project's grants and withdrawals.
 */
export function buildRoleDefinitions(): Record<BuiltinRole, RoleDefinition> {
  const result = {} as Record<BuiltinRole, RoleDefinition>
  for (const role of BUILTIN_ROLES) {
    const def = ROLE_DELTA_DEFINITIONS[role]
    result[role] = {
      name: role,
      label: def.label,
      description: def.description,
      get permissions() {
        return resolveRolePermissions(role)
      },
    }
  }
  return result
}

/**
 * Check if one role is another, or inherits from it.
 *
 * For two built-in roles that is their order in the hierarchy. A project role
 * is at least the roles in its ancestry and no other: an `auditor` that
 * inherits from `viewer` is at least a viewer and a guest, and is not a
 * member. No built-in role is at least a project role.
 *
 * Fails closed (returns `false`) when either role is not recognised so that
 * typos or drift never accidentally grant access.
 */
export function isRoleAtLeast(userRole: Role, requiredRole: Role): boolean {
  return includedRoles(userRole).includes(requiredRole)
}
