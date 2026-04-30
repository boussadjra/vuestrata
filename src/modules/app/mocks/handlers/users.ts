import { delay, http, HttpResponse } from 'msw'

import type { Permission, PaginatedResponse, Role, User } from '~/types'

import { useDemoAuthBackend } from '../../state/demo-auth-backend'
import { isValidToken } from '../utils'

export const usersHandlers = [
  http.get('*/users', async ({ request }) => {
    await delay(200)
    if (!isValidToken(request)) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }
    const { getDemoUsers } = useDemoAuthBackend()
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') ?? '1')
    const pageSize = Number(url.searchParams.get('pageSize') ?? '10')
    const search = url.searchParams.get('search') ?? ''
    const role = url.searchParams.get('role') ?? ''

    let filtered = await getDemoUsers()
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
    const { getDemoUsers, setDemoUsers } = useDemoAuthBackend()
    const body = (await request.json()) as { role: Role }
    const users = await getDemoUsers()
    const idx = users.findIndex((u) => u.id === params['id'])
    if (idx === -1) {
      return HttpResponse.json({ message: 'User not found' }, { status: 404 })
    }
    const updated = { ...users[idx]!, role: body.role }
    const next = [...users]
    next[idx] = updated
    await setDemoUsers(next)
    return HttpResponse.json(updated)
  }),

  http.post('*/users', async ({ request }) => {
    await delay(200)
    if (!isValidToken(request)) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }
    const { getDemoUsers, setDemoUsers } = useDemoAuthBackend()
    const body = (await request.json()) as { email?: string; name?: string; role?: Role }
    if (!body.email || !body.name) {
      return HttpResponse.json({ message: 'email and name are required' }, { status: 422 })
    }
    const users = await getDemoUsers()
    if (users.some((u) => u.email === body.email)) {
      return HttpResponse.json({ message: 'Email already exists' }, { status: 409 })
    }
    const newUser: User = {
      id: crypto.randomUUID(),
      email: body.email,
      name: body.name,
      role: body.role ?? 'member',
      emailVerified: false,
      provider: 'credentials',
      createdAt: new Date().toISOString(),
    }
    await setDemoUsers([...users, newUser])
    return HttpResponse.json(newUser, { status: 201 })
  }),

  http.patch('*/users/:id/permissions', async ({ request, params }) => {
    await delay(200)
    if (!isValidToken(request)) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }
    const { getDemoUsers, setDemoUsers, getDemoSession, setDemoSession } = useDemoAuthBackend()
    const body = (await request.json()) as { permissions: Permission[] }
    const users = await getDemoUsers()
    const idx = users.findIndex((u) => u.id === params['id'])
    if (idx === -1) {
      return HttpResponse.json({ message: 'User not found' }, { status: 404 })
    }
    const updated: User = { ...users[idx]!, permissions: body.permissions }
    const next = [...users]
    next[idx] = updated
    await setDemoUsers(next)

    // Refresh persisted session if this is a self-edit
    const session = await getDemoSession()
    if (session && session.user.id === updated.id) {
      await setDemoSession({ ...session, user: updated })
    }

    return HttpResponse.json(updated)
  }),
]
