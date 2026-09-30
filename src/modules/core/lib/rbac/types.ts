export type Role = 'super_admin' | 'admin' | 'manager' | 'member' | 'viewer' | 'guest'

/**
 * Every permission Vuestrata itself ships, as a closed union.
 *
 * Closed on purpose: a `string`-typed permission means `can('user:read')` — note
 * the missing plural — compiles, always returns false, and silently hides a
 * page. A project adds its own permissions through `AppPermissions` below
 * rather than editing this union, so the compiler still finds every place that
 * needs updating.
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
// vuestrata:permissions-start
// vuestrata:permissions-end
// app:permissions-start
// app:permissions-end

/**
 * The permissions a project declares itself.
 *
 * Empty here, filled by declaration merging from `app/config/rbac.overrides.ts`:
 *
 *     declare module '~/lib/rbac/types' {
 *       interface AppPermissions {
 *         'invoices:read': true
 *       }
 *     }
 *
 * The keys are what matter; the value type is not read. An interface rather
 * than a union because a union cannot be extended from another file, and this
 * file belongs to Vuestrata — a project that edits it stops receiving updates
 * to it.
 */
// oxlint-disable-next-line typescript/no-empty-object-type -- extended by declaration merging
export interface AppPermissions {}

// Permission type: a strict union, enforced at compile time — the built-in
// literals plus whatever the project declared in `AppPermissions`. Permissions
// only known at runtime should be validated at runtime, not typed as `string`.
// oxlint-disable-next-line typescript/no-redundant-type-constituents -- `never` until a project augments it
export type Permission = BuiltinPermission | keyof AppPermissions

/**
 * What a project changes about the permission model without editing it.
 * Written in `app/config/rbac.overrides.ts` through `defineRbacOverrides`.
 */
export interface RbacOverrides {
  /**
   * Permissions given to a role. Like the built-in deltas they accumulate up
   * the hierarchy, so a permission granted to `viewer` is held by every role
   * above it as well.
   */
  grants?: Partial<Record<Role, readonly Permission[]>>
  /**
   * Permissions taken away from every role and left out of the registry — how
   * `vuestrata eject` retires the permissions of the modules it removes.
   */
  withdrawn?: readonly Permission[]
}

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
