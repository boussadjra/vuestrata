export type Role = 'super_admin' | 'admin' | 'manager' | 'member' | 'viewer' | 'guest'

/**
 * Every permission the application knows about, as a closed union.
 *
 * Closed on purpose: a `string`-typed permission means `can('user:read')` — note
 * the missing plural — compiles, always returns false, and silently hides a
 * page. Adding a domain means adding its permissions here and granting them in
 * `inheritance.ts`; the compiler then finds every place that needs updating.
 */
export type BuiltinPermission =
  // ─── Platform ───────────────────────────────────────────
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
  // ─── Domain modules ─────────────────────────────────────
  | 'customers:read'
  | 'customers:manage'
  | 'orders:read'
  | 'orders:manage'
  | 'catalog:read'
  | 'catalog:manage'
  | 'projects:read'
  | 'projects:manage'
  | 'calendar:read'
  | 'calendar:manage'
  | 'messages:read'
  | 'team:read'
// gen:permissions-start
// gen:permissions-end

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
