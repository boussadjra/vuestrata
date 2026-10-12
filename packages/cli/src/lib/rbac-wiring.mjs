/**
 * How `state/runtime-backends.ts` hands `rbac.overrides.ts` to core/lib.
 *
 * The file is Vuestrata's from 1.1.0, so a pristine project gets the wired copy
 * from the upgrade. An edited copy stays as it was, and without this change what
 * the project declares, grants and withdraws in `rbac.overrides.ts` has no
 * effect — and nothing fails to say so. `doctor` warns, and the promotion note
 * names the change.
 */

/** Whether `source` installs the project's RBAC overrides. */
export const isRbacWired = (source) => /\binstallRbacConfig\s*\(/.test(source)

/** The change to an edited copy, as one paragraph for a note or a warning. */
export const RBAC_WIRING_STEPS =
  'To wire it in, add two lines to state/runtime-backends.ts: at the top level, ' +
  '`const rbacConfig = resolveRbacOverrides(rbacOverrides)` (with ' +
  "`import rbacOverrides from '~/config/rbac.overrides'` and " +
  "`import { resolveRbacOverrides } from '~/lib/rbac/overrides'`), and in " +
  'installRuntimeBackends(), before installRbacBackend(), `installRbacConfig(rbacConfig)` ' +
  "(imported from '~/lib/runtime'). Also pass `rbacConfig` as the second argument of " +
  "`resolveRolePermissions('super_admin', rbacConfig)`, so the permissions the registry is " +
  'seeded with match. The copy this release ships shows all of it.'
