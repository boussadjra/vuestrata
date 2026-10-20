import { param } from '@queryweave/core'

import { defineListQueryModel } from '~/lib/table-query'

import { listedRoles } from './presentation'

/** Created at the route boundary after the project's RBAC configuration is installed. */
export function createUsersListQueryModel() {
  return defineListQueryModel({
    pageSize: 5,
    pageSizes: [5, 10, 20, 50],
    sortBy: ['name', 'email', 'role', 'provider', 'emailVerified', 'lastLoginAt'],
    fields: { role: param.choice(listedRoles().map((role) => role.name)).optional() },
  })
}
