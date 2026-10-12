/**
 * ─────────────────────────────────────────────────────────────────────────────
 * This file is yours. Vuestrata never modifies it once it has written it.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Your permissions and roles live here instead of in `core/lib/rbac/`, which is
 * Vuestrata's: edit that and it stops receiving updates. Each part is a region
 * the generators write to (`vuestrata add module` fills the first;
 * `vuestrata eject` fills the last):
 *
 *   permissions   the strings your app declares, so `can('invoices:read')`
 *                 type-checks and `can('invoice:read')` — note the missing
 *                 plural — does not
 *   roles         the roles your app adds to the built-in six: the name, in
 *                 `AppRoles`, and what it is, under `roles`
 *   grants        which role holds which permission
 *   withdrawn     built-in permissions your app does not use
 *
 * Declaring is not granting: until a role holds a permission, a route guarded by
 * it is unreachable for everyone, `super_admin` included. Grants accumulate up
 * the hierarchy, so a permission granted to `viewer` is held by every role
 * above it too:
 *
 *   grants: {
 *     viewer: ['invoices:read'],
 *     manager: ['invoices:manage'],
 *   },
 *
 * A role of your own is declared once and defined once. It holds what the
 * roles it inherits from hold, plus what you grant it; no built-in role
 * inherits from it. The built-in hierarchy itself cannot be rearranged here:
 *
 *   interface AppRoles {
 *     auditor: true
 *   }
 *
 *   roles: {
 *     auditor: { inherits: ['viewer'], label: 'Auditor' },
 *   },
 *   grants: {
 *     auditor: ['audit:read'],
 *   },
 *
 * `docs/9.recipes/7.add-a-permission.md` walks through both.
 */
import { defineRbacOverrides } from '~/lib/rbac/overrides'

declare module '~/lib/rbac/types' {
  interface AppPermissions {
    // app:permissions-start
    // app:permissions-end
  }
  interface AppRoles {
    // app:roles-start
    // app:roles-end
  }
}

export default defineRbacOverrides({
  roles: {
    // app:role-definitions-start
    // app:role-definitions-end
  },
  grants: {
    // app:grants-start
    // app:grants-end
  },
  withdrawn: [
    // app:withdrawn-start
    // app:withdrawn-end
  ],
})
