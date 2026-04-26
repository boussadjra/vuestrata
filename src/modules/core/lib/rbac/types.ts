export type Role = 'super_admin' | 'admin' | 'manager' | 'member' | 'viewer' | 'guest'

// The 16 built-in permissions — preserves autocomplete for known permissions
export type BuiltinPermission =
  | 'users:read'
  | 'users:create'
  | 'users:update'
  | 'users:delete'
  | 'roles:read'
  | 'roles:assign'
  | 'billing:read'
  | 'billing:manage'
  | 'dashboard:read'
  | 'dashboard:export'
  | 'settings:read'
  | 'settings:update'
  | 'reports:read'
  | 'reports:create'
  | 'reports:export'
  | 'audit:read'

// Permission type: strict union of built-in literals enforced at compile time.
// Dynamic permissions should be added to BuiltinPermission or validated at runtime.
export type Permission = BuiltinPermission

export interface RoleDefinition {
  name: Role
  label: string
  description: string
  permissions: Permission[]
}

// Structural reactive wrapper — compatible with Vue Ref<T> and ComputedRef<T>
// without importing Vue in this framework-agnostic module
export interface ReactiveValue<T> {
  readonly value: T
}

export interface RbacUserSource {
  role: ReactiveValue<Role>
  permissions: ReactiveValue<string[]>
}

export interface AuthorizationEvent {
  /**
   * The permission(s) that were checked. A single string for `hasPermission`,
   * an array for `hasAnyPermission`/`hasAllPermissions`. Consumers that want a
   * flat representation can `[].concat(event.permission).join(',')` themselves.
   */
  permission: string | string[]
  granted: boolean
  userRole: Role
  source: 'guard' | 'component'
  context?: Record<string, unknown>
}

export type AuthorizationHookFn = (event: AuthorizationEvent) => void

export type PredicateFn = (context: Record<string, unknown>) => boolean
