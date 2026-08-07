/** Team directory server state. */
import { createCollectionApi } from '~/lib/api/collection-queries'

import { teamModuleKeys } from '../query-keys'
import { memberSchema, type TeamFilters, type TeamMember } from '../types'

const teamApi = createCollectionApi<TeamMember, TeamFilters>({
  resource: 'team',
  schema: memberSchema,
  keys: teamModuleKeys,
})

export const useTeamQuery = teamApi.useList
export const useTeamMemberQuery = teamApi.useDetail
