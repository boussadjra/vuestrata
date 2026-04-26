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
    delta: ['reports:read'],
  },
  member: {
    label: 'Member',
    description: 'Standard team member',
    delta: ['users:read', 'settings:read'],
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
 */
export function resolveRolePermissions(role: Role): Permission[] {
  const roleIndex = ROLE_HIERARCHY.indexOf(role)
  if (roleIndex === -1) return []

  const permSet = new Set<string>()

  // Walk from lowest (guest) up to the given role
  for (let i = ROLE_HIERARCHY.length - 1; i >= roleIndex; i--) {
    const r = ROLE_HIERARCHY[i]!
    for (const perm of ROLE_DELTA_DEFINITIONS[r].delta) {
      permSet.add(perm)
    }
  }

  return [...permSet] as Permission[]
}

/** Build full RoleDefinition objects from delta definitions. */
export function buildRoleDefinitions(): Record<Role, RoleDefinition> {
  const result = {} as Record<Role, RoleDefinition>
  for (const role of ROLE_HIERARCHY) {
    const def = ROLE_DELTA_DEFINITIONS[role]
    result[role] = {
      name: role,
      label: def.label,
      description: def.description,
      permissions: resolveRolePermissions(role),
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
