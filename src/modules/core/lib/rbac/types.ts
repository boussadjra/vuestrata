/**
 * The six roles Vuestrata ships, as a closed union, highest first.
 *
 * Closed for the reason `BuiltinPermission` is: with `string`,
 * `isAtLeast('manger')` compiles and is always false. A project adds its own
 * roles through `AppRoles` below rather than editing this union.
 */
export type BuiltinRole = 'super_admin' | 'admin' | 'manager' | 'member' | 'viewer' | 'guest'

/**
 * The roles a project declares itself.
 *
 * Empty here, filled by declaration merging from `app/config/rbac.overrides.ts`,
 * which is also where each one is defined (what it inherits from, its label):
 *
 *     declare module '~/lib/rbac/types' {
 *       interface AppRoles {
 *         auditor: true
 *       }
 *     }
 *
 * The keys are what matter; the value type is not read.
 */
// oxlint-disable-next-line typescript/no-empty-object-type -- extended by declaration merging
export interface AppRoles {}

/**
 * The role names of an app that declares `Declared`: the built-in six and its
 * own. Generic so the rule can be stated, and tested, for a declaration other
 * than the one the whole program shares.
 */
export type RoleOf<Declared> = BuiltinRole | Extract<keyof Declared, string>

/**
 * Role type: a strict union, enforced at compile time — the built-in roles plus
 * whatever the project declared in `AppRoles`. With nothing declared it is
 * exactly `BuiltinRole`.
 */
export type Role = RoleOf<AppRoles>

/** The names in `Declared` that are a project's own: a built-in name is not one. */
export type ProjectRoleName<Declared = AppRoles> = Exclude<
  Extract<keyof Declared, string>,
  BuiltinRole
>

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
export interface RbacOverrides<Declared = AppRoles> {
  /**
   * The project's own roles: one entry for every name declared in `AppRoles`.
   *
   * A built-in role cannot be given here. Its place in the hierarchy is fixed
   * in this version; what it holds is changed with `grants` and `withdrawn`.
   */
  roles?: ProjectRoles<Declared>
  /**
   * Permissions given to a role. Like the built-in deltas they accumulate up
   * the hierarchy, so a permission granted to `viewer` is held by every role
   * above it as well, and by every project role that inherits from it.
   */
  grants?: Partial<Record<RoleOf<Declared>, readonly Permission[]>>
  /**
   * Permissions taken away from every role and left out of the registry — how
   * `vuestrata eject` retires the permissions of the modules it removes.
   */
  withdrawn?: readonly Permission[]
}

/**
 * A role the project defines in `app/config/rbac.overrides.ts`.
 *
 * It holds what the roles it inherits from hold, plus what `grants` gives it.
 * Nothing inherits from it unless another project role says so: the built-in
 * hierarchy is not rearranged around it.
 */
export interface ProjectRole<Name extends string = Role> {
  /**
   * The roles whose permissions this one also holds, built-in or the project's
   * own. `[]` for a role that holds only what it is granted. A role that names
   * a parent the app does not have, or that inherits from itself through any
   * chain, is rejected when the app starts, and until fixed holds nothing.
   */
  inherits: readonly Name[]
  /**
   * The i18n key of its name. Defaults to `role_<name>`, the key the built-in
   * roles use, so adding that key to `<locale>.overrides.json` is enough.
   */
  labelKey?: string
  /** Its name in plain text, shown when no translation exists for the key. */
  label?: string
  description?: string
  /** Whether a role picker offers it. Defaults to `true`. */
  assignable?: boolean
}

/**
 * The `roles` table: every declared role, and no other. With none declared the
 * table accepts no entry at all, so a role defined but never declared (or a
 * typo in its name) is a compile error rather than a role nothing recognises.
 */
export type ProjectRoles<Declared = AppRoles> = [ProjectRoleName<Declared>] extends [never]
  ? Record<string, never>
  : { [Name in ProjectRoleName<Declared>]: ProjectRole<RoleOf<Declared>> }

/**
 * What `defineRbacOverrides` asks for on top of `RbacOverrides`: once a role is
 * declared, the `roles` table is required, so a declared role cannot be left
 * undefined. Nothing, while `AppRoles` is empty.
 */
export type DefinesDeclaredRoles<Declared = AppRoles> = [ProjectRoleName<Declared>] extends [never]
  ? unknown
  : { roles: ProjectRoles<Declared> }

/** A project role as the runtime holds it: checked, with its ancestry worked out. */
export interface ResolvedProjectRole {
  name: string
  /** The parents it names. */
  inherits: readonly string[]
  /** Itself and every role it inherits from, directly or not. */
  includes: readonly string[]
  labelKey?: string
  label?: string
  description?: string
  assignable: boolean
}

export interface RoleDefinition {
  name: Role
  label: string
  description: string
  permissions: Permission[]
}

/**
 * A role as `getRoleDefinitions()` describes it, built-in or the project's.
 *
 * `label` is plain text and `labelKey` the translation to prefer over it:
 * `roleLabel()` picks between them.
 */
export interface ResolvedRoleDefinition extends RoleDefinition {
  builtin: boolean
  /** The roles it holds the permissions of, by its own definition. */
  inherits: readonly Role[]
  labelKey: string
  /** Whether a role picker offers it. */
  assignable: boolean
}

// Structural reactive wrapper — compatible with Vue Ref<T> and ComputedRef<T>
// without importing Vue in this framework-agnostic module
export interface ReactiveValue<T> {
  readonly value: T
}

export interface RbacUserSource {
  role: ReactiveValue<Role>
  /**
   * Every role the user holds, when there is more than `role`. Optional: a
   * source written for one role per user keeps working, and is read as
   * `[role]`.
   */
  roles?: ReactiveValue<readonly Role[]>
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
