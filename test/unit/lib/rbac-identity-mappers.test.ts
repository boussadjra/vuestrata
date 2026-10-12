import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'

import { parseUser } from '@/lib/auth/user'
import { registerPermissions, resolveRolePermissions, resolveSubjectPermissions } from '@/lib/rbac'
import { applyIdentity, identityMappers, type RoleMap } from '@/lib/rbac/identity-mappers'
import { resolveRbacOverrides } from '@/lib/rbac/overrides'
import type { Permission, RbacOverrides, Role } from '@/lib/rbac/types'
import { installRbacConfig } from '@/lib/runtime'

import { captureLogged } from '../../utils/logged'

/**
 * Identity-provider claims, read into the app's own roles and permissions.
 *
 * The payloads below have the shape each vendor documents for the claims the
 * mappers read. The URL beside each is where that shape is stated; the values
 * (ids, issuers, names) are made up. What the documentation was checked for is
 * said per provider, and what could not be checked is said too.
 */

interface Declared {
  auditor: true
}

const PROJECT: RbacOverrides<Declared> = {
  roles: { auditor: { inherits: ['viewer'] } },
  grants: { auditor: ['audit:read'] },
}

const roles = (...names: string[]) => names as Role[]
const roleMap = (map: Record<string, string | string[]>) => map as RoleMap

let logged: ReturnType<typeof captureLogged>

beforeEach(() => {
  installRbacConfig(resolveRbacOverrides<Declared>(PROJECT))
  logged = captureLogged()
})

afterEach(() => {
  logged.restore()
})

// ─── Keycloak ────────────────────────────────────────────────────────────────

/**
 * A Keycloak access token payload.
 *
 * Checked: the two claims and their nesting. Keycloak's built-in "realm roles"
 * mapper writes `realm_access.roles` and its "client roles" mapper writes
 * `resource_access.${client_id}.roles`, both multivalued, both added by the
 * `roles` client scope ("OpenID Connect scope for add user roles to the access
 * token").
 *   https://github.com/keycloak/keycloak/blob/main/services/src/main/java/org/keycloak/protocol/oidc/OIDCLoginProtocolFactory.java
 *   https://www.keycloak.org/admin-api/protocol-mappers
 * Not checked against a source: the other claims of the payload, and the role
 * names Keycloak creates by default (`offline_access`, `uma_authorization`,
 * `default-roles-<realm>`, the `account` client's roles). They are here as
 * names the app does not have, which is all the mapper needs of them.
 */
const keycloakToken = {
  exp: 1_760_000_300,
  iat: 1_760_000_000,
  jti: '6c1d4a0e-0000-4000-8000-000000000001',
  iss: 'https://sso.example.test/realms/acme',
  aud: 'account',
  sub: '9f0c2b1a-0000-4000-8000-000000000002',
  typ: 'Bearer',
  azp: 'acme-web',
  realm_access: {
    roles: ['offline_access', 'default-roles-acme', 'uma_authorization', 'manager'],
  },
  resource_access: {
    'acme-web': { roles: ['auditor', 'report-viewer'] },
    account: { roles: ['manage-account', 'manage-account-links', 'view-profile'] },
  },
  scope: 'openid profile email',
  email_verified: true,
  preferred_username: 'ada',
  email: 'ada@example.test',
}

describe('identityMappers.keycloak', () => {
  it('reads realm roles, and the roles of the one client it is told about', () => {
    const identity = identityMappers.keycloak({ clientId: 'acme-web' })(keycloakToken)

    // `manager` and `auditor` are app roles by name; the rest are not roles here.
    expect(identity).toEqual({
      roles: ['manager', 'auditor'],
      permissions: [],
      hasPermissions: false,
    })
  })

  it('reads no client role without a client id: other clients say nothing of this app', () => {
    expect(identityMappers.keycloak()(keycloakToken).roles).toEqual(['manager'])
    // And never the roles of a client it was not pointed at.
    const account = identityMappers.keycloak({
      clientId: 'acme-web',
      roleMap: roleMap({ 'manage-account': 'admin' }),
    })
    expect(account(keycloakToken).roles).toEqual(['manager', 'auditor'])
  })

  it('maps provider names to app roles, one to one or one to several', () => {
    const identity = identityMappers.keycloak({
      clientId: 'acme-web',
      roleMap: roleMap({
        'report-viewer': 'viewer',
        'default-roles-acme': ['guest', 'member'],
        // A mapping onto a name the app does not have maps onto nothing.
        offline_access: 'operator',
      }),
    })(keycloakToken)

    expect(identity.roles).toEqual(['guest', 'member', 'manager', 'auditor', 'viewer'])
  })

  it('lets a role be mapped away from the app role it happens to be named like', () => {
    const identity = identityMappers.keycloak({
      roleMap: roleMap({ manager: 'viewer' }),
    })(keycloakToken)

    expect(identity.roles).toEqual(['viewer'])
  })

  it('can be told to read realm roles only, or client roles only', () => {
    expect(
      identityMappers.keycloak({ clientId: 'acme-web', includeClientRoles: false })(keycloakToken)
        .roles,
    ).toEqual(['manager'])
    expect(
      identityMappers.keycloak({ clientId: 'acme-web', includeRealmRoles: false })(keycloakToken)
        .roles,
    ).toEqual(['auditor'])
  })

  it('reports each name it dropped once, and nothing of the user', () => {
    const map = identityMappers.keycloak({ clientId: 'acme-web' })

    map(keycloakToken)
    map(keycloakToken)
    const warnings = logged.warnings()

    expect(warnings.map((line) => /Ignored the role ("[^"]+")/.exec(line)?.[1])).toEqual([
      '"offline_access"',
      '"default-roles-acme"',
      '"uma_authorization"',
      '"report-viewer"',
    ])
    expect(warnings.join('\n')).not.toContain('ada')
    expect(warnings.join('\n')).not.toContain(keycloakToken.sub)
  })
})

// ─── Auth0 ───────────────────────────────────────────────────────────────────

/**
 * An Auth0 access token payload for an API with RBAC enabled.
 *
 * Checked: `permissions` is the claim Auth0 adds when "Enable RBAC" and "Add
 * Permissions in the Access Token" are on, an array of the permission names
 * assigned to the user (the documented sample is
 * `[ "create:bar", "create:foo", "read:bar", "read:foo" ]`).
 *   https://auth0.com/docs/secure/tokens/access-tokens/access-token-profiles
 *   https://auth0.com/docs/get-started/apis/enable-role-based-access-control-for-apis
 * Checked: roles reach a token only through an Action, as a custom claim, and
 * Auth0's own sample sets `${namespace}/roles` to `event.authorization.roles`
 * (an array of role names); custom claims are namespaced with a URL you
 * control.
 *   https://auth0.com/docs/manage-users/access-control/sample-use-cases-actions-with-authorization
 *   https://auth0.com/docs/secure/tokens/json-web-tokens/create-custom-claims
 * Not checked against a source: the rest of the payload.
 */
const NAMESPACE = 'https://acme.example'
const auth0Token = {
  iss: 'https://acme.eu.auth0.com/',
  sub: 'auth0|65a1b2c3d4e5f60012345678',
  aud: ['https://api.acme.example', 'https://acme.eu.auth0.com/userinfo'],
  iat: 1_760_000_000,
  exp: 1_760_086_400,
  azp: 'kXb1Qm0000000000000000000000000a',
  scope: 'openid profile email',
  permissions: ['read:users', 'create:users', 'manage:users', 'delete:everything'],
  [`${NAMESPACE}/roles`]: ['Manager', 'Support'],
}

describe('identityMappers.auth0', () => {
  const permissionMap = {
    'read:users': 'users:read',
    'create:users': 'users:create',
    'manage:users': ['users:update', 'users:delete'],
  } as const

  it('reads the permissions claim, mapped to the app’s own ids', () => {
    const identity = identityMappers.auth0({ permissionMap })(auth0Token)

    expect(identity).toEqual({
      roles: [],
      permissions: ['users:read', 'users:create', 'users:update', 'users:delete'],
      hasPermissions: true,
    })
  })

  it('drops a permission the app does not declare, mapped or not', () => {
    const identity = identityMappers.auth0({
      permissionMap: { ...permissionMap, 'delete:everything': 'everything:delete' as Permission },
    })(auth0Token)

    expect(identity.permissions).not.toContain('everything:delete')
    expect(identity.permissions).not.toContain('delete:everything')
    expect(logged.warnings().join('\n')).toContain('Ignored the permission "everything:delete"')
  })

  it('keeps a permission that already is an app permission, by name', () => {
    const identity = identityMappers.auth0()({ permissions: ['users:read', 'audit:read', 'x:y'] })

    expect(identity.permissions).toEqual(['users:read', 'audit:read'])
  })

  it('knows a permission a module registered, and not one the project withdrew', () => {
    registerPermissions('invoices', ['read'])
    installRbacConfig(resolveRbacOverrides<Declared>({ ...PROJECT, withdrawn: ['users:read'] }))

    const identity = identityMappers.auth0()({ permissions: ['invoices:read', 'users:read'] })

    expect(identity.permissions).toEqual(['invoices:read'])
  })

  it('reads roles from the namespaced claim, through the role map', () => {
    const identity = identityMappers.auth0({
      namespace: NAMESPACE,
      roleMap: roleMap({ Manager: 'manager', Support: 'auditor' }),
      permissionsClaim: false,
    })(auth0Token)

    expect(identity).toEqual({
      roles: ['manager', 'auditor'],
      permissions: [],
      hasPermissions: false,
    })
    // A namespace written with its trailing slash names the same claim.
    expect(
      identityMappers.auth0({
        namespace: `${NAMESPACE}/`,
        roleMap: roleMap({ Manager: 'manager' }),
      })(auth0Token).roles,
    ).toEqual(['manager'])
  })

  it('reads no role without a namespace: Auth0 issues no roles claim of its own', () => {
    expect(identityMappers.auth0()({ ...auth0Token, roles: ['admin'] }).roles).toEqual([])
  })

  it('tells an empty permission list from no permission list', () => {
    const map = identityMappers.auth0({
      namespace: NAMESPACE,
      roleMap: roleMap({ Manager: 'manager' }),
    })

    // RBAC on, nothing assigned: the user may do nothing.
    expect(map({ ...auth0Token, permissions: [] })).toMatchObject({
      permissions: [],
      hasPermissions: true,
    })
    // "Add Permissions in the Access Token" off: the roles decide.
    const { permissions: _none, ...withoutClaim } = auth0Token
    expect(map(withoutClaim)).toMatchObject({ permissions: [], hasPermissions: false })
  })

  it('reads permissions from another claim when told to', () => {
    const identity = identityMappers.auth0({ permissionsClaim: `${NAMESPACE}/permissions` })({
      [`${NAMESPACE}/permissions`]: ['users:read'],
      permissions: ['users:delete'],
    })

    expect(identity.permissions).toEqual(['users:read'])
  })
})

// ─── Microsoft Entra ID ──────────────────────────────────────────────────────

/**
 * A Microsoft Entra ID v2.0 access token payload.
 *
 * Checked, all from the access token claims reference: `roles` is an "Array of
 * strings" holding, for a user token, "the assigned roles of the user on the
 * target application"; `groups` is a "JSON array of GUIDs", the object ids of
 * the user's groups; past 200 groups (JWT) the claim is left out and
 * `_claim_names: { groups: "src1" }` with `_claim_sources` is sent instead;
 * `hasgroups`, "if present, always true", says to ask Microsoft Graph; `wids`
 * is an array of directory role template ids; `scp` is a space separated
 * string of scopes.
 *   https://learn.microsoft.com/en-us/entra/identity-platform/access-token-claims-reference
 * Not checked: that app role values look like `Task.Manager` (they are free
 * text chosen in the app registration).
 */
const GROUP_FINANCE = '0a1b2c3d-0000-4000-8000-00000000f1a0'
const GROUP_EVERYONE = '0a1b2c3d-0000-4000-8000-0000000000e1'
const entraToken = {
  aud: '6e74172b-0000-4000-8000-00000000a0d1',
  iss: 'https://login.microsoftonline.com/72f988bf-0000-4000-8000-000000000001/v2.0',
  iat: 1_760_000_000,
  nbf: 1_760_000_000,
  exp: 1_760_003_900,
  name: 'Ada Lovelace',
  oid: '00000000-0000-4000-8000-0000000000ad',
  preferred_username: 'ada@contoso.example',
  roles: ['Task.Manager', 'Reports.Read'],
  groups: [GROUP_FINANCE, GROUP_EVERYONE],
  wids: ['b79fbf4d-3ef9-4689-8143-76b194e85509'],
  scp: 'access_as_user',
  sub: 'AAAAAAAAAAAAAAAAAAAAAIkzqFVrSaSaFHy782bbtaQ',
  tid: '72f988bf-0000-4000-8000-000000000001',
  ver: '2.0',
}

describe('identityMappers.entra', () => {
  it('reads app roles through the role map', () => {
    const identity = identityMappers.entra({
      roleMap: roleMap({ 'Task.Manager': 'manager', 'Reports.Read': 'viewer' }),
    })(entraToken)

    expect(identity).toEqual({
      roles: ['manager', 'viewer'],
      permissions: [],
      hasPermissions: false,
    })
  })

  it('takes an app role whose value already is an app role name', () => {
    expect(
      identityMappers.entra()({ ...entraToken, roles: ['auditor', 'Task.Manager'] }).roles,
    ).toEqual(['auditor'])
  })

  it('reads groups only through the group map, and says nothing of the others', () => {
    const identity = identityMappers.entra({
      roleMap: roleMap({ 'Task.Manager': 'manager' }),
      groupMap: roleMap({ [GROUP_FINANCE]: ['auditor', 'member'] }),
    })(entraToken)

    expect(identity.roles).toEqual(['manager', 'auditor', 'member'])
    // The unmapped app role is reported; the unmapped group is not.
    expect(logged.warnings().join('\n')).toContain('"Reports.Read"')
    expect(logged.warnings().join('\n')).not.toContain(GROUP_EVERYONE)
  })

  it('does not read groups without a group map, even one named like a role', () => {
    expect(identityMappers.entra()({ roles: [], groups: ['admin', GROUP_FINANCE] }).roles).toEqual(
      [],
    )
  })

  it('never reads directory roles or scopes as app roles', () => {
    const identity = identityMappers.entra()({
      ...entraToken,
      roles: [],
      wids: ['admin', 'super_admin'],
      scp: 'admin super_admin',
    })

    expect(identity.roles).toEqual([])
  })

  it('grants nothing from groups on an overage token, and says why once', () => {
    const { groups: _left_out, ...rest } = entraToken
    const overage = {
      ...rest,
      _claim_names: { groups: 'src1' },
      _claim_sources: {
        src1: { endpoint: 'https://graph.microsoft.com/v1.0/users/{userID}/getMemberObjects' },
      },
    }
    const map = identityMappers.entra({
      roleMap: roleMap({ 'Task.Manager': 'manager' }),
      groupMap: roleMap({ [GROUP_FINANCE]: 'auditor' }),
    })

    expect(map(overage).roles).toEqual(['manager'])
    expect(map({ ...rest, hasgroups: true }).roles).toEqual(['manager'])
    expect(logged.warnings().filter((line) => line.includes('groups overage'))).toHaveLength(1)
  })
})

// ─── Anything else ───────────────────────────────────────────────────────────

describe('identityMappers.claims', () => {
  it('reads roles and permissions from wherever the project says they are', () => {
    const identity = identityMappers.claims({
      roles: (claims) => claims['cognito:groups'],
      permissions: (claims) =>
        typeof claims.scope === 'string' ? claims.scope.split(' ') : undefined,
      roleMap: roleMap({ Admins: 'admin', Auditors: 'auditor' }),
      permissionMap: { 'users.read': 'users:read' },
    })({ 'cognito:groups': ['Admins', 'Auditors', 'Everyone'], scope: 'openid users.read' })

    expect(identity).toEqual({
      roles: ['admin', 'auditor'],
      permissions: ['users:read'],
      hasPermissions: true,
    })
  })

  it('leaves the roles to decide when no permission reader is given, or it finds none', () => {
    expect(identityMappers.claims({ roles: () => ['viewer'] })({})).toEqual({
      roles: ['viewer'],
      permissions: [],
      hasPermissions: false,
    })
    expect(
      identityMappers.claims({ roles: () => ['viewer'], permissions: (claims) => claims.perms })(
        {},
      ),
    ).toMatchObject({ hasPermissions: false })
  })

  it('hands the readers an object whatever the claims were', () => {
    const seen: unknown[] = []
    const map = identityMappers.claims({
      roles: (claims) => {
        seen.push(claims)
        return claims.roles
      },
    })

    for (const raw of [null, undefined, 'admin', 7, ['admin'], true]) {
      expect(map(raw).roles).toEqual([])
    }
    expect(seen).toEqual([{}, {}, {}, {}, {}, {}])
  })

  it('reads what a reader returns as carefully as a claim', () => {
    for (const returned of ['admin', { 0: 'admin', length: 1 }, 7, null, undefined, [['admin']]]) {
      expect(identityMappers.claims({ roles: () => returned })({}).roles).toEqual([])
    }
  })
})

// ─── Hostile claims ──────────────────────────────────────────────────────────

describe('claims that are not what a token should hold', () => {
  const mappers = {
    keycloak: identityMappers.keycloak({ clientId: 'acme-web' }),
    auth0: identityMappers.auth0({ namespace: NAMESPACE }),
    entra: identityMappers.entra({ groupMap: roleMap({ [GROUP_FINANCE]: 'admin' }) }),
    claims: identityMappers.claims({ roles: (claims) => claims.roles }),
  }
  const NOTHING = { roles: [], permissions: [], hasPermissions: false }

  it.each(Object.entries(mappers))(
    '%s grants nothing for claims of the wrong kind',
    (_name, map) => {
      for (const raw of [null, undefined, '', 'admin', 0, 42, true, [], ['admin'], () => ({})]) {
        expect(map(raw)).toEqual(NOTHING)
      }
    },
  )

  it('grants nothing when a roles claim is not an array of strings', () => {
    const shapes = ['admin', { 0: 'admin', length: 1 }, { admin: true }, 1, true, null, [['admin']]]

    for (const shape of shapes) {
      expect(mappers.keycloak({ realm_access: { roles: shape } }).roles).toEqual([])
      expect(mappers.keycloak({ realm_access: shape }).roles).toEqual([])
      expect(mappers.keycloak({ resource_access: { 'acme-web': { roles: shape } } }).roles).toEqual(
        [],
      )
      expect(mappers.keycloak({ resource_access: shape }).roles).toEqual([])
      expect(mappers.auth0({ [`${NAMESPACE}/roles`]: shape }).roles).toEqual([])
      expect(mappers.entra({ roles: shape, groups: shape }).roles).toEqual([])
      expect(mappers.claims({ roles: shape }).roles).toEqual([])
    }
    expect(identityMappers.auth0()({ permissions: 'users:delete' })).toEqual(NOTHING)
    expect(identityMappers.auth0()({ permissions: { 0: 'users:delete', length: 1 } })).toEqual(
      NOTHING,
    )
  })

  it('skips the members that are not strings', () => {
    const mixed = [null, 7, { name: 'admin' }, ['admin'], true, 'viewer', undefined]

    expect(mappers.keycloak({ realm_access: { roles: mixed } }).roles).toEqual(['viewer'])
    expect(mappers.entra({ roles: mixed }).roles).toEqual(['viewer'])
    expect(
      identityMappers.auth0()({ permissions: [null, 1, 'users:read', {}] }).permissions,
    ).toEqual(['users:read'])
  })

  it('finds nothing through a prototype, in the claims or in the maps', () => {
    // As a token would deliver it: JSON, where `__proto__` is an ordinary key.
    const polluted = JSON.parse(
      '{"__proto__": {"realm_access": {"roles": ["super_admin"]}, "roles": ["super_admin"], ' +
        '"permissions": ["users:delete"]}, "constructor": {"roles": ["super_admin"]}}',
    ) as unknown
    // And as an object whose prototype really carries the claims.
    const inherited = Object.create({
      realm_access: { roles: ['super_admin'] },
      roles: ['super_admin'],
      permissions: ['users:delete'],
    }) as unknown

    for (const raw of [polluted, inherited]) {
      expect(mappers.keycloak(raw)).toEqual(NOTHING)
      expect(mappers.entra(raw)).toEqual(NOTHING)
      expect(identityMappers.auth0()(raw)).toEqual(NOTHING)
    }
    // Reading it changed no prototype.
    expect(({} as Record<string, unknown>).roles).toBeUndefined()
    expect(({} as Record<string, unknown>).realm_access).toBeUndefined()
  })

  it('does not look a role up on the prototype of a role map', () => {
    const hostileNames = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']
    const map = identityMappers.keycloak({ roleMap: roleMap({ staff: 'member' }) })

    expect(map({ realm_access: { roles: [...hostileNames, 'staff'] } }).roles).toEqual(['member'])
    // A client id that names a prototype member reads no client.
    for (const clientId of hostileNames) {
      expect(
        identityMappers.keycloak({ clientId })({
          resource_access: { 'acme-web': { roles: ['admin'] } },
        }).roles,
      ).toEqual([])
    }
  })

  it('reads no further than a few hundred entries of one claim', () => {
    const huge = Array.from({ length: 200_000 }, (_, index) => `role-${index}`)

    const started = performance.now()
    expect(mappers.keycloak({ realm_access: { roles: [...huge, 'super_admin'] } }).roles).toEqual(
      [],
    )
    expect(mappers.keycloak({ realm_access: { roles: ['super_admin', ...huge] } }).roles).toEqual([
      'super_admin',
    ])
    expect(identityMappers.auth0()({ permissions: [...huge, 'users:delete'] }).permissions).toEqual(
      [],
    )
    // Not a benchmark: a bound that a walk over every entry, three times, would miss.
    expect(performance.now() - started).toBeLessThan(2000)
  })

  it('never returns a name the app does not declare, whatever the map says', () => {
    const identity = identityMappers.claims({
      roles: () => ['a', 'b', 'c'],
      permissions: () => ['p', 'q'],
      roleMap: roleMap({ a: 'root', b: ['admin', 'wheel'], c: '__proto__' }),
      permissionMap: { p: 'everything:all' as Permission, q: ['users:read', 'x:y' as Permission] },
    })({})

    expect(identity).toEqual({
      roles: ['admin'],
      permissions: ['users:read'],
      hasPermissions: true,
    })
  })

  it('survives a map whose values are not what the types say', () => {
    const identity = identityMappers.claims({
      roles: () => ['a', 'b', 'c', 'viewer'],
      roleMap: { a: 7, b: null, c: [1, 'member', {}] } as unknown as RoleMap,
    })({})

    expect(identity.roles).toEqual(['member', 'viewer'])
  })
})

// ─── Onto a user ─────────────────────────────────────────────────────────────

describe('applyIdentity', () => {
  const map = identityMappers.keycloak({ clientId: 'acme-web' })
  const profile = { id: keycloakToken.sub, email: keycloakToken.email, name: 'Ada' }

  it('gives the user the mapped roles, and the primary of them as its role', () => {
    const user = parseUser(applyIdentity(profile, map(keycloakToken)))

    expect(user).toEqual({ ...profile, role: 'manager', roles: ['manager', 'auditor'] })
    expect(new Set(resolveSubjectPermissions(user))).toEqual(
      new Set([...resolveRolePermissions('manager'), 'audit:read']),
    )
  })

  it('replaces what the payload said about roles and permissions', () => {
    const fromPayload = {
      ...profile,
      role: 'super_admin',
      roles: ['admin'],
      permissions: ['users:delete'],
    }

    const user = parseUser(applyIdentity(fromPayload, map(keycloakToken)))

    expect(user.role).toBe('manager')
    expect(user.roles).toEqual(['manager', 'auditor'])
    expect(user).not.toHaveProperty('permissions')
    expect(resolveSubjectPermissions(user)).not.toContain('users:delete')
  })

  it('leaves a user whose claims amount to no role with none, holding nothing', () => {
    const fromPayload = { ...profile, role: 'super_admin' }

    const user = parseUser(applyIdentity(fromPayload, map({ realm_access: { roles: ['nobody'] } })))

    expect(user).not.toHaveProperty('role')
    expect(user.roles).toEqual([])
    expect(resolveSubjectPermissions(user)).toEqual([])
  })

  it('sets the permissions only when the claims carried a list', () => {
    const auth0 = identityMappers.auth0({
      namespace: NAMESPACE,
      roleMap: roleMap({ Manager: 'manager' }),
    })

    const explicit = parseUser(
      applyIdentity(profile, auth0({ ...auth0Token, permissions: ['users:read'] })),
    )
    expect(explicit.permissions).toEqual(['users:read'])
    expect(resolveSubjectPermissions(explicit)).toEqual(['users:read'])

    const nothing = parseUser(applyIdentity(profile, auth0({ ...auth0Token, permissions: [] })))
    expect(nothing.permissions).toEqual([])
    expect(resolveSubjectPermissions(nothing)).toEqual([])

    const { permissions: _none, ...withoutClaim } = auth0Token
    const byRole = parseUser(applyIdentity(profile, auth0(withoutClaim)))
    expect(byRole).not.toHaveProperty('permissions')
    expect(resolveSubjectPermissions(byRole)).toEqual(resolveRolePermissions('manager'))
  })

  it('does not hand out the mapper’s own arrays', () => {
    const identity = map(keycloakToken)
    const user = applyIdentity(profile, identity)

    user.roles.push('super_admin')

    expect(identity.roles).toEqual(roles('manager', 'auditor'))
  })
})
