/**
 * ─────────────────────────────────────────────────────────────────────────────
 * This file is yours. Vuestrata never modifies it once it has written it.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Your permissions live here instead of in `core/lib/rbac/`, which is
 * Vuestrata's: edit that and it stops receiving updates. Three things, each in
 * a region the generators write to (`vuestrata add module` fills the first;
 * `vuestrata eject` fills the last):
 *
 *   permissions   the strings your app declares, so `can('invoices:read')`
 *                 type-checks and `can('invoice:read')` — note the missing
 *                 plural — does not
 *   grants        which role holds them
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
 */
import { defineRbacOverrides } from '~/lib/rbac/overrides'

declare module '~/lib/rbac/types' {
  interface AppPermissions {
    // app:permissions-start
    // app:permissions-end
  }
}

export default defineRbacOverrides({
  grants: {
    // app:grants-start
    // app:grants-end
  },
  withdrawn: [
    // app:withdrawn-start
    // app:withdrawn-end
  ],
})
