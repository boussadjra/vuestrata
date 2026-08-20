import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vite-plus/test'

import { createCollectionMock } from '@/mocks/collection'
import { createMockJwt, mockApiUrl } from '@/mocks/utils'

/**
 * The mock backend answers API URLs and nothing else.
 *
 * MSW's service worker sees EVERY same-origin request, not only the ones the
 * app makes through `apiGet`. A bare `*​/projects/:id` therefore claimed URLs it
 * was never meant to: Vite serves the app's own source tree from the same
 * origin, so `GET /src/modules/projects/presentation.ts` matched and — carrying
 * no bearer token, as no module script does — came back 401, and the page died
 * on its own source file. A hard reload of `/dashboard/projects/42` matched the
 * same handler and answered the navigation with JSON.
 *
 * Neither is reachable from the e2e gate, which runs against a built bundle
 * where sources live under `/assets/*` and every route change is client-side.
 * This is the only thing standing between that bug and the next module.
 */

const projects = createCollectionMock<{ id: string; name: string }>({
  resource: 'projects',
  seed: [{ id: 'p-1', name: 'Apollo' }],
  searchFields: ['name'],
})

/** Last resort: anything the mock backend did not claim lands here. */
const NOT_CLAIMED = 418
const fallback = http.all(/.*/, () => HttpResponse.text('not claimed', { status: NOT_CLAIMED }))

const server = setupServer(...projects.handlers, fallback)
const AUTH = { Authorization: `Bearer ${createMockJwt({ sub: 'demo' })}` }

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  projects.reset()
})
afterAll(() => server.close())

describe('mock handler scope', () => {
  it('anchors handlers to the API base path', () => {
    expect(mockApiUrl('/projects/:id')).toBe('*/api/projects/:id')
  })

  it.each([
    ['a source module Vite serves in dev', 'http://localhost/src/modules/projects/presentation.ts'],
    ['a hard reload of a detail route', 'http://localhost/dashboard/projects/p-1'],
    ['a list route', 'http://localhost/dashboard/projects'],
  ])('does not claim %s', async (_label, url) => {
    const response = await fetch(url)

    expect(response.status).toBe(NOT_CLAIMED)
  })

  it('still serves the endpoint the app actually calls', async () => {
    const response = await fetch('http://localhost/api/projects/p-1', { headers: AUTH })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ id: 'p-1', name: 'Apollo' })
  })

  it('still refuses an unauthenticated API request', async () => {
    const response = await fetch('http://localhost/api/projects')

    expect(response.status).toBe(401)
  })
})
