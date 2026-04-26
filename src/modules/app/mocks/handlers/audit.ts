import { http, HttpResponse, delay } from 'msw'

import type { AuditLogEntry, PaginatedResponse } from '~/types'

import { mockAuditLogs } from '../fixtures'
import { isValidToken } from '../utils'

export const auditHandlers = [
  http.get('*/audit-logs', async ({ request }) => {
    await delay(200)
    if (!isValidToken(request)) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') ?? '1')
    const pageSize = Number(url.searchParams.get('pageSize') ?? '20')

    const total = mockAuditLogs.length
    const start = (page - 1) * pageSize
    const data = mockAuditLogs.slice(start, start + pageSize)

    return HttpResponse.json({
      data,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    } satisfies PaginatedResponse<AuditLogEntry>)
  }),
]
