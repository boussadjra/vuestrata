import { tryGetRbacConfig, type RbacConfig } from '~/lib/runtime'

import type { Role, Permission, RoleDefinition } from './types'

// ─── Role Hierarchy ───────────────────────────────────────

export const ROLE_HIERARCHY: Role[] = [
  'super_admin',
  'admin',
  'manager',
  'member',
  'viewer',
  'guest',
]

// ─── Delta-Based Role Definitions ─────────────────────────
// Each role lists only the permissions it adds beyond its parent in the hierarchy.

const ROLE_DELTA_DEFINITIONS: Record<
  Role,
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

/**
 * Resolve the full permission set for a role by walking the hierarchy
 * from guest up to the given role, accumulating deltas.
 *
 * The project's grants accumulate the same way, and its withdrawn permissions
 * come off last, so a withdrawal wins over a grant. `config` defaults to the
 * installed one; it is a parameter so the app layer can resolve the seed set at
 * import, before bootstrap has installed anything.
 */
export function resolveRolePermissions(
  role: Role,
  config: RbacConfig | null = tryGetRbacConfig(),
): Permission[] {
  const roleIndex = ROLE_HIERARCHY.indexOf(role)
  if (roleIndex === -1) return []

  const permSet = new Set<string>()

  // Walk from lowest (guest) up to the given role
  for (let i = ROLE_HIERARCHY.length - 1; i >= roleIndex; i--) {
    const r = ROLE_HIERARCHY[i]!
    for (const perm of ROLE_DELTA_DEFINITIONS[r].delta) {
      permSet.add(perm)
    }
    for (const perm of config?.grants[r] ?? []) {
      permSet.add(perm)
    }
  }

  for (const perm of config?.withdrawn ?? []) {
    permSet.delete(perm)
  }

  return [...permSet] as Permission[]
}

/**
 * Build full RoleDefinition objects from delta definitions.
 *
 * `permissions` is read live rather than captured: `ROLE_DEFINITIONS` is built
 * when the RBAC barrel is first imported, which is before bootstrap installs the
 * project's grants and withdrawals.
 */
export function buildRoleDefinitions(): Record<Role, RoleDefinition> {
  const result = {} as Record<Role, RoleDefinition>
  for (const role of ROLE_HIERARCHY) {
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
 * Check if one role is at or above another in the hierarchy.
 * Fails closed (returns `false`) when either role is not recognised so that
 * typos or drift never accidentally grant access.
 */
export function isRoleAtLeast(userRole: Role, requiredRole: Role): boolean {
  const userIndex = ROLE_HIERARCHY.indexOf(userRole)
  const requiredIndex = ROLE_HIERARCHY.indexOf(requiredRole)
  if (userIndex === -1 || requiredIndex === -1) return false
  return userIndex <= requiredIndex
}
