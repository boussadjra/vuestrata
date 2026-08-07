/** Team directory mock backend — demo builds only. Read-only by design. */
import { createCollectionMock } from '~/mocks/collection'

import type { TeamMember } from '../types'
import { teamFixtures } from './fixtures'

// No `create` or `update`: the directory is sourced from the HR system in any
// real deployment, and offering an edit form the backend will reject is worse
// than offering none.
const teamMock = createCollectionMock<TeamMember>({
  resource: 'team',
  seed: teamFixtures,
  searchFields: ['name', 'title', 'location', 'email'],
  filterFields: ['department', 'status'],
  defaultSort: { by: 'name', order: 'asc' },
})

export const teamHandlers = teamMock.handlers
export const resetTeamMock = teamMock.reset
