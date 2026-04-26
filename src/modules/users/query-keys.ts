import { defineQueryKeys } from '~/lib/query-keys'

/**
 * Users module query keys.
 * Follows [module, resource, ...params] convention.
 */
export const usersModuleKeys = {
  ...defineQueryKeys('users'),
}
