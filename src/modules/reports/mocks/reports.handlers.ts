/** Reports mock backend — demo builds only. Read-only. */
import { createCollectionMock } from '~/mocks/collection'

import type { Report } from '../types'
import { reportFixtures } from './fixtures'

const reportsMock = createCollectionMock<Report>({
  resource: 'reports',
  seed: reportFixtures,
  searchFields: ['name', 'description', 'owner'],
  filterFields: ['kind', 'period'],
  rangeField: 'generatedAt',
  defaultSort: { by: 'name', order: 'asc' },
})

export const reportsHandlers = reportsMock.handlers
export const resetReportsMock = reportsMock.reset
