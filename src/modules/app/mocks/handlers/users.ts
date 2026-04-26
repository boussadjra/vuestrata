import { http, HttpResponse, delay } from 'msw'

import type { Role, PaginatedResponse, User } from '~/types'

import { mockUsers } from '../fixtures'
import { isValidToken } from '../utils'

export const usersHandlers = [
  http.get('*/users', async ({ request }) => {
    await delay(200)
    if (!isValidToken(request)) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') ?? '1')
    const pageSize = Number(url.searchParams.get('pageSize') ?? '10')
    const search = url.searchParams.get('search') ?? ''
    const role = url.searchParams.get('role') ?? ''

    let filtered = [...mockUsers]
    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter(
        (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
      )
    }
    if (role) {
      filtered = filtered.filter((u) => u.role === role)
    }

    const total = filtered.length
    const start = (page - 1) * pageSize
    const data = filtered.slice(start, start + pageSize)

    return HttpResponse.json({
      data,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    } satisfies PaginatedResponse<User>)
  }),

  http.patch('*/users/:id/role', async ({ request, params }) => {
    await delay(200)
    if (!isValidToken(request)) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }
    const body = (await request.json()) as { role: Role }
    const user = mockUsers.find((u) => u.id === params['id'])
    if (!user) {
      return HttpResponse.json({ message: 'User not found' }, { status: 404 })
    }
    user.role = body.role
    return HttpResponse.json(user)
  }),
]
