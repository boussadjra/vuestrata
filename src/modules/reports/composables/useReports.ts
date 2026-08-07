/** Reports server state. */
import { createCollectionApi } from '~/lib/api/collection-queries'

import { reportsModuleKeys } from '../query-keys'
import { reportSchema, type Report, type ReportFilters } from '../types'

const reportsApi = createCollectionApi<Report, ReportFilters>({
  resource: 'reports',
  schema: reportSchema,
  keys: reportsModuleKeys,
})

export const useReportsQuery = reportsApi.useList
export const useReportQuery = reportsApi.useDetail
