import { http, HttpResponse, delay } from 'msw'

import { mockUsers } from '@/mocks/fixtures'
import { createMockJwt, isValidToken } from '@/mocks/utils'
import type { AuthCredentials, User } from '~/types'

function tokensFor(user: User) {
  return {
    token: createMockJwt({
      sub: user.id,
      email: user.email,
      role: user.role,
      expiresInSeconds: 3600,
    }),
    refreshToken: createMockJwt({ sub: user.id, expiresInSeconds: 60 * 60 * 24 * 7 }),
    expiresIn: 3600,
  }
}

export const authMockHandlers = [
  http.post('*/auth/login', async ({ request }) => {
    await delay(300)
    const body = (await request.json()) as AuthCredentials
    const matchedUser = mockUsers.find((u) => u.email === body.email)
    if (matchedUser && body.password) {
      if (matchedUser.mfaEnabled) {
        return HttpResponse.json({
          mfaRequired: true,
          mfaToken: 'mock-mfa-token-' + Date.now(),
          user: matchedUser,
          token: '',
          refreshToken: '',
          expiresIn: 0,
        })
      }
      return HttpResponse.json({
        user: matchedUser,
        ...tokensFor(matchedUser),
      })
    }
    return HttpResponse.json(
      { message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' },
      { status: 401 },
    )
  }),

  http.post('*/auth/register', async ({ request }) => {
    await delay(300)
    const body = (await request.json()) as AuthCredentials & { name: string }
    const newUser: User = {
      id: String(mockUsers.length + 1),
      email: body.email,
      name: body.name,
      role: 'member',
      emailVerified: false,
      provider: 'credentials',
      createdAt: new Date().toISOString(),
    }
    mockUsers.push(newUser)
    return HttpResponse.json({
      user: newUser,
      ...tokensFor(newUser),
    })
  }),

  http.post('*/auth/magic-link', async ({ request }) => {
    await delay(500)
    const body = (await request.json()) as { email: string }
    return HttpResponse.json({ message: `Magic link sent to ${body.email}` })
  }),

  http.post('*/auth/magic-link/verify', async () => {
    await delay(300)
    const user = mockUsers[0]!
    return HttpResponse.json({
      user,
      ...tokensFor(user),
    })
  }),

  // ── MFA ────────────────────────────────────────────────
  http.post('*/auth/mfa/setup', async ({ request }) => {
    await delay(300)
    if (!isValidToken(request)) {
      return HttpResponse.json({ message: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    return HttpResponse.json({
      secret: 'JBSWY3DPEHPK3PXP',
      qrCodeUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      backupCodes: ['ABC12345', 'DEF67890', 'GHI11223', 'JKL44556', 'MNO77889'],
    })
  }),

  http.post('*/auth/mfa/verify', async ({ request }) => {
    await delay(300)
    const body = (await request.json()) as { mfaToken: string; code: string }
    if (body.code === '000000' || body.code?.length === 6) {
      const user = { ...mockUsers[0]!, mfaEnabled: true }
      return HttpResponse.json({
        user,
        ...tokensFor(user),
      })
    }
    return HttpResponse.json(
      { message: 'Invalid MFA code', code: 'INVALID_MFA_CODE' },
      { status: 401 },
    )
  }),

  http.post('*/auth/mfa/disable', async ({ request }) => {
    await delay(200)
    if (!isValidToken(request)) {
      return HttpResponse.json({ message: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    return HttpResponse.json({ message: 'MFA disabled' })
  }),
]
