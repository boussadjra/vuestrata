import { tryGetRbacConfig } from '~/lib/runtime'

import { resolvePrimaryRole } from './identity'
import { tryGetRegisteredPermissions } from './registry'
import { isKnownRole, reportRbacOnce, reportUnknownName } from './role-graph'
import type { Permission, Role } from './types'

/**
 * From an identity provider's claims to this app's roles and permissions.
 *
 * An enterprise identity provider does not send `role: 'manager'`. Keycloak
 * sends `realm_access.roles`, Auth0 a `permissions` array and whatever roles
 * claim an Action adds under a namespace, Microsoft Entra ID `roles` and
 * `groups`. These functions read those shapes and answer in the app's own
 * vocabulary, for `mapUser` in `app/config/auth.config.ts`:
 *
 *     const identity = identityMappers.keycloak({ clientId: 'my-app' })
 *     mapUser: (raw) => applyIdentity({ id: raw.sub, email: raw.email }, identity(raw))
 *
 * Three rules, the same for every mapper:
 *
 * - **Only names the app declares come out.** A provider role is looked up in
 *   `roleMap` (provider name → app role); one that is not in the map counts
 *   only if it already is the name of an app role; anything else is dropped. A
 *   role invented at the provider, or misspelt there, never becomes a role
 *   here. The same for permissions, against the permission registry.
 * - **Claims are read as hostile input.** They come out of a token, and may be
 *   any shape: a missing object, a string where an array should be, an array
 *   of a million entries, a key named `__proto__`. Nothing here trusts the
 *   shape, follows a prototype, or throws on it; what cannot be read grants
 *   nothing.
 * - **Pure.** No request, no storage, no framework: claims in, names out.
 *
 * THE SECURITY BOUNDARY. What these return shapes the interface: which links
 * the sidebar shows, which routes the guard opens. It does not protect
 * anything. The claims are read in the browser, by code the user can change,
 * and nothing here verifies a signature. Every role and permission must be
 * enforced again by the backend, from a token it validated itself.
 *
 * Imported by path (`~/lib/rbac/identity-mappers`), not through the barrel, so
 * a project that maps nothing does not carry the code.
 */

/** What a mapper found in a set of claims, in the app's own names. */
export interface MappedIdentity {
  /** The app roles the claims amount to, each once, in the order found. */
  roles: Role[]
  /** The app permissions the claims list. Empty when they list none. */
  permissions: Permission[]
  /**
   * Whether the claims carried a permission list at all, even an empty one.
   * A user's explicit permissions replace what their roles grant, so this is
   * what tells "the provider sent no permissions, let the roles decide" from
   * "the provider says this user may do nothing".
   */
  hasPermissions: boolean
}

/** A mapper: configured once, then called with each user's claims. */
export type IdentityMapper = (claims: unknown) => MappedIdentity

/**
 * Provider name → app role, or several. Written as a plain object; read by own
 * keys only, so a provider role named `constructor` finds nothing.
 */
export type RoleMap = Readonly<Record<string, Role | readonly Role[]>>
/** Provider permission → app permission, or several. */
export type PermissionMap = Readonly<Record<string, Permission | readonly Permission[]>>

/** More entries than this in one claim are not read: no user holds that many. */
const MAX_CLAIM_VALUES = 500

type Claims = Record<string, unknown>

const isRecord = (value: unknown): value is Claims =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** An own property of a claims object. `undefined` for anything else, a prototype included. */
function read(claims: unknown, key: string): unknown {
  return isRecord(claims) && Object.hasOwn(claims, key) ? claims[key] : undefined
}

/** The strings of an array claim, capped. Anything that is not an array has none. */
function names(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, MAX_CLAIM_VALUES)
    .filter((entry): entry is string => typeof entry === 'string')
}

/** What `map` says about `name`, by own key; the name itself when it says nothing. */
function mapped<T extends string>(
  map: Readonly<Record<string, T | readonly T[]>> | undefined,
  name: string,
): readonly string[] {
  if (!map || !Object.hasOwn(map, name)) return [name]
  const target = map[name]
  if (typeof target === 'string') return [target]
  return Array.isArray(target) ? target.filter((entry) => typeof entry === 'string') : []
}

/**
 * Provider roles as app roles. `quiet` is for a claim that lists far more than
 * roles of this app (directory groups): there an entry the map does not name is
 * not a mistake, and is dropped without being reported.
 */
function toRoles(provided: readonly string[], roleMap?: RoleMap, quiet = false): Role[] {
  const config = tryGetRbacConfig()
  const roles: Role[] = []

  for (const name of provided) {
    if (quiet && !(roleMap && Object.hasOwn(roleMap, name))) continue
    for (const candidate of mapped(roleMap, name)) {
      if (!isKnownRole(candidate, config)) reportUnknownName('role', candidate)
      else if (!roles.includes(candidate)) roles.push(candidate)
    }
  }
  return roles
}

/** Provider permissions as app permissions: registered, and not withdrawn. */
function toPermissions(provided: readonly string[], permissionMap?: PermissionMap): Permission[] {
  const registered = tryGetRegisteredPermissions()
  const withdrawn: readonly string[] = tryGetRbacConfig()?.withdrawn ?? []
  const permissions: Permission[] = []

  for (const name of provided) {
    for (const candidate of mapped(permissionMap, name)) {
      if (!registered.has(candidate) || withdrawn.includes(candidate)) {
        reportUnknownName('permission', candidate)
      } else if (!permissions.includes(candidate as Permission)) {
        permissions.push(candidate as Permission)
      }
    }
  }
  return permissions
}

const merge = (...lists: Role[][]): Role[] => [...new Set(lists.flat())]

// ─── Keycloak ────────────────────────────────────────────────────────────────

export interface KeycloakIdentityOptions {
  /**
   * The client whose roles count: the key under `resource_access`. Without it
   * no client role is read. The token lists the roles of every client the user
   * has any in (`account`, for one), and those say nothing about this app.
   */
  clientId?: string
  /** Keycloak role name → app role. */
  roleMap?: RoleMap
  /** Read `realm_access.roles`. Defaults to `true`. */
  includeRealmRoles?: boolean
  /** Read `resource_access[clientId].roles`. Defaults to `true`. */
  includeClientRoles?: boolean
}

/**
 * Keycloak's default role claims: realm roles under `realm_access.roles`,
 * client roles under `resource_access.<client id>.roles`.
 *
 *     {
 *       "realm_access": { "roles": ["offline_access", "manager"] },
 *       "resource_access": { "my-app": { "roles": ["auditor"] } }
 *     }
 *
 * Both names are those of Keycloak's built-in "realm roles" and "client roles"
 * protocol mappers, which the `roles` client scope adds to the ACCESS token.
 * A realm that renamed the claim, or flattened it, needs `identityMappers.claims`.
 * Keycloak sends no permission list this reads.
 *
 * https://www.keycloak.org/admin-api/protocol-mappers (User Realm Role, User Client Role)
 * https://github.com/keycloak/keycloak/blob/main/services/src/main/java/org/keycloak/protocol/oidc/OIDCLoginProtocolFactory.java
 */
function keycloak(options: KeycloakIdentityOptions = {}): IdentityMapper {
  const { clientId, roleMap, includeRealmRoles = true, includeClientRoles = true } = options

  return (claims) => {
    const realm = includeRealmRoles ? names(read(read(claims, 'realm_access'), 'roles')) : []
    const client =
      includeClientRoles && clientId
        ? names(read(read(read(claims, 'resource_access'), clientId), 'roles'))
        : []

    return {
      roles: merge(toRoles(realm, roleMap), toRoles(client, roleMap)),
      permissions: [],
      hasPermissions: false,
    }
  }
}

// ─── Auth0 ───────────────────────────────────────────────────────────────────

export interface Auth0IdentityOptions {
  /**
   * The namespace your Action adds the roles claim under: with
   * `https://my-app.example.com`, roles are read from
   * `https://my-app.example.com/roles`. Without it no role is read: Auth0
   * issues no roles claim of its own.
   */
  namespace?: string
  /** Auth0 role name → app role. */
  roleMap?: RoleMap
  /**
   * The claim holding the user's permissions. Defaults to `permissions`, which
   * Auth0 adds to an access token when the API has RBAC and "Add Permissions in
   * the Access Token" enabled. `false` reads none.
   */
  permissionsClaim?: string | false
  /** Auth0 permission name (`read:users`) → app permission (`users:read`). */
  permissionMap?: PermissionMap
}

/**
 * Auth0: a `permissions` array, and roles under a namespaced custom claim.
 *
 *     {
 *       "https://my-app.example.com/roles": ["Manager"],
 *       "permissions": ["read:users", "create:users"]
 *     }
 *
 * `permissions` is the claim Auth0 itself adds to an access token for an API
 * with RBAC enabled. Roles are not in a token unless a post-login Action puts
 * them there, and a custom claim has to be namespaced, so there is no fixed
 * name: this reads `<namespace>/roles`, the name Auth0's own sample uses.
 *
 * When the claims carry `permissions`, even empty, that list is the user's
 * whole set and their roles grant nothing on top (`hasPermissions`).
 *
 * https://auth0.com/docs/secure/tokens/access-tokens/access-token-profiles (the permissions claim)
 * https://auth0.com/docs/get-started/apis/enable-role-based-access-control-for-apis
 * https://auth0.com/docs/manage-users/access-control/sample-use-cases-actions-with-authorization (roles claim)
 * https://auth0.com/docs/secure/tokens/json-web-tokens/create-custom-claims (namespaces)
 */
function auth0(options: Auth0IdentityOptions = {}): IdentityMapper {
  const { namespace, roleMap, permissionsClaim = 'permissions', permissionMap } = options
  const rolesClaim = namespace
    ? `${namespace}${namespace.endsWith('/') ? '' : '/'}roles`
    : undefined

  return (claims) => {
    const listed = permissionsClaim === false ? undefined : read(claims, permissionsClaim)

    return {
      roles: rolesClaim ? toRoles(names(read(claims, rolesClaim)), roleMap) : [],
      permissions: toPermissions(names(listed), permissionMap),
      hasPermissions: Array.isArray(listed),
    }
  }
}

// ─── Microsoft Entra ID ──────────────────────────────────────────────────────

export interface EntraIdentityOptions {
  /** App role value (the `value` of an app role in the app registration) → app role. */
  roleMap?: RoleMap
  /**
   * Group object id (a GUID) → app role. A group that is not in the map is
   * dropped without a word: a user is in many groups that mean nothing here.
   * Without a map, `groups` is not read.
   */
  groupMap?: RoleMap
}

/**
 * Microsoft Entra ID: app roles in `roles`, group object ids in `groups`.
 *
 *     {
 *       "roles": ["Task.Manager"],
 *       "groups": ["0a1b2c3d-0000-4000-8000-123456789abc"]
 *     }
 *
 * `roles` holds the values of the app roles assigned to the user on the
 * application. `groups` holds object ids, and only when the app registration
 * asks for group claims. Past 200 groups Entra leaves `groups` out of a JWT and
 * sends an overage marker instead (`_claim_names.groups`, or `hasgroups`): the
 * list then has to be fetched from Microsoft Graph,
 * which a function of the claims cannot do. With a `groupMap` configured that
 * is reported in development, and the user gets no role from groups. Prefer
 * app roles, or resolve groups on the backend. Entra sends no permission list
 * this reads (`scp` holds delegated scopes, which are about the client).
 *
 * https://learn.microsoft.com/en-us/entra/identity-platform/access-token-claims-reference
 */
function entra(options: EntraIdentityOptions = {}): IdentityMapper {
  const { roleMap, groupMap } = options

  return (claims) => {
    const overage =
      read(read(claims, '_claim_names'), 'groups') !== undefined ||
      read(claims, 'hasgroups') === true
    if (groupMap && overage) {
      reportRbacOnce(
        'entra-groups-overage',
        'A token from Microsoft Entra ID carries a groups overage marker: the user is in too ' +
          'many groups for the token, so `groups` is absent and `groupMap` granted nothing. ' +
          'Use app roles, or resolve the groups on your backend.',
      )
    }

    return {
      roles: merge(
        toRoles(names(read(claims, 'roles')), roleMap),
        groupMap ? toRoles(names(read(claims, 'groups')), groupMap, true) : [],
      ),
      permissions: [],
      hasPermissions: false,
    }
  }
}

// ─── Anything else ───────────────────────────────────────────────────────────

export interface ClaimsIdentityOptions {
  /** Where the provider's role names are. Anything but an array of strings reads as none. */
  roles: (claims: Record<string, unknown>) => unknown
  /**
   * Where its permission names are. Returning an array, even an empty one,
   * makes it the user's whole permission set; returning anything else leaves
   * the roles to decide.
   */
  permissions?: (claims: Record<string, unknown>) => unknown
  roleMap?: RoleMap
  permissionMap?: PermissionMap
}

/**
 * Any other provider, or one of the above with its claims renamed: say where
 * the names are, and the same rules apply to what you return.
 *
 *     identityMappers.claims({
 *       roles: (claims) => claims['cognito:groups'],
 *       roleMap: { Admins: 'admin' },
 *     })
 *
 * The functions receive the claims object (an empty one when the claims are
 * not an object at all) and should read it as carefully as this file does.
 */
function claims(options: ClaimsIdentityOptions): IdentityMapper {
  const { roles, permissions, roleMap, permissionMap } = options

  return (raw) => {
    const source = isRecord(raw) ? raw : {}
    const listed = permissions?.(source)

    return {
      roles: toRoles(names(roles(source)), roleMap),
      permissions: toPermissions(names(listed), permissionMap),
      hasPermissions: Array.isArray(listed),
    }
  }
}

export const identityMappers = { keycloak, auth0, entra, claims }

/**
 * Put what a mapper found on a user, for `mapUser` to return.
 *
 * The user's roles and permissions become exactly what the claims say, and
 * nothing the payload said about them is kept: `roles` is the mapped list,
 * `role` its primary one (none when the list is empty, which the app reads as
 * a user who holds nothing), and `permissions` the mapped list when the claims
 * carried one, else absent so that the roles decide.
 *
 *     mapUser: (raw) => {
 *       const claims = raw as { sub: string; email: string; name?: string }
 *       return applyIdentity(
 *         { id: claims.sub, email: claims.email, name: claims.name },
 *         identity(raw),
 *       )
 *     }
 */
export function applyIdentity<User extends object>(
  user: User,
  identity: MappedIdentity,
): Omit<User, 'role' | 'roles' | 'permissions'> & {
  role: Role | undefined
  roles: Role[]
  permissions: Permission[] | undefined
} {
  return {
    ...user,
    role: resolvePrimaryRole({ roles: identity.roles }),
    roles: [...identity.roles],
    permissions: identity.hasPermissions ? [...identity.permissions] : undefined,
  }
}
