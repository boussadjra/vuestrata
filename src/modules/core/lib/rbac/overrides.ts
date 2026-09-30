import type { RbacConfig } from '~/lib/runtime'

import type { RbacOverrides } from './types'

/**
 * Declare what a project changes about the permission model.
 *
 * An identity function: it exists so `app/config/rbac.overrides.ts` is
 * type-checked against `RbacOverrides` and reads the same as the other seams.
 * A release can add optional fields to `RbacOverrides` without breaking a copy
 * written against the old one.
 */
export function defineRbacOverrides(overrides: RbacOverrides): RbacOverrides {
  return overrides
}

/**
 * The shape the runtime slot holds — every field present, so readers never
 * branch on `undefined`.
 */
export function resolveRbacOverrides(overrides: RbacOverrides = {}): RbacConfig {
  return {
    grants: overrides.grants ?? {},
    withdrawn: overrides.withdrawn ?? [],
  }
}
