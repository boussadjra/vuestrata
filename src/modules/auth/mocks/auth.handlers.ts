import { delay, http, HttpResponse } from 'msw'

import { createMockJwt, isValidToken } from '@/mocks/utils'
import { useDemoAuthBackend } from '@/state/demo-auth-backend'
import { ensureDefaultDemoUsers, getDemoUsers } from '@/state/demo-store'
import { DEMO_ACCOUNT } from '@/state/demo/account'
import type { AuthCredentials, User } from '~/types'

function tokensFor(user: User) {
  return {
    token: createMockJwt({
      sub: user.id,
      email: user.email,
      role: user.role,
      permissions: user.permissions?.map(String) ?? [],
      expiresInSeconds: 3600,
    }),
    refreshToken: createMockJwt({ sub: user.id, expiresInSeconds: 60 * 60 * 24 * 7 }),
    expiresIn: 3600,
  }
}

export const authMockHandlers = [
  http.post('*/auth/login', async ({ request }) => {
    await delay(300)
    const { setDemoSession } = useDemoAuthBackend()
    const body = (await request.json()) as AuthCredentials
    const users = await ensureDefaultDemoUsers()
    const matchedUser = users.find((u) => u.email === body.email)

    // The password is actually checked now. This used to be `body.password`
    // alone — any non-empty string logged you in as the matched user — which
    // made the demo's "invalid credentials" path untestable and meant the
    // login form was not demonstrating a login at all.
    //
    // Registered users choose their own password, which the demo store does
    // not persist (storing passwords, even fake ones, is a habit worth not
    // teaching), so any non-empty password is accepted for them. The seeded
    // demo account must match DEMO_ACCOUNT exactly.
    const isSeededDemoAccount = matchedUser?.email === DEMO_ACCOUNT.email
    const passwordAccepted = isSeededDemoAccount
      ? body.password === DEMO_ACCOUNT.password
      : Boolean(body.password)

    if (matchedUser && passwordAccepted) {
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
      const tokens = tokensFor(matchedUser)
      await setDemoSession({ user: matchedUser, ...tokens })
      return HttpResponse.json({ user: matchedUser, ...tokens })
    }
    return HttpResponse.json(
      { message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' },
      { status: 401 },
    )
  }),

  http.post('*/auth/register', async ({ request }) => {
    await delay(300)
    const { setDemoUsers, setDemoSession } = useDemoAuthBackend()
    const body = (await request.json()) as AuthCredentials & { name: string }
    const users = await ensureDefaultDemoUsers()
    const newUser: User = {
      id: crypto.randomUUID(),
      email: body.email,
      name: body.name,
      role: 'member',
      emailVerified: false,
      provider: 'credentials',
      createdAt: new Date().toISOString(),
    }
    await setDemoUsers([...users, newUser])
    const tokens = tokensFor(newUser)
    await setDemoSession({ user: newUser, ...tokens })
    return HttpResponse.json({ user: newUser, ...tokens })
  }),

  http.post('*/auth/magic-link', async ({ request }) => {
    await delay(500)
    const body = (await request.json()) as { email: string }
    return HttpResponse.json({ message: `Magic link sent to ${body.email}` })
  }),

  http.post('*/auth/magic-link/verify', async () => {
    await delay(300)
    const { setDemoSession } = useDemoAuthBackend()
    const users = await ensureDefaultDemoUsers()
    const user = users[0]!
    const tokens = tokensFor(user)
    await setDemoSession({ user, ...tokens })
    return HttpResponse.json({ user, ...tokens })
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
    const { setDemoSession } = useDemoAuthBackend()
    const body = (await request.json()) as { mfaToken: string; code: string }
    if (body.code === '000000' || body.code?.length === 6) {
      const users = await ensureDefaultDemoUsers()
      const user = { ...users[0]!, mfaEnabled: true }
      const tokens = tokensFor(user)
      await setDemoSession({ user, ...tokens })
      return HttpResponse.json({ user, ...tokens })
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

  // ── Session ─────────────────────────────────────────────
  http.get('*/auth/me', async ({ request }) => {
    await delay(100)
    if (!isValidToken(request)) {
      return HttpResponse.json({ message: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    const { getDemoSession } = useDemoAuthBackend()
    const session = await getDemoSession()
    if (!session) {
      return HttpResponse.json({ message: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    return HttpResponse.json(session.user)
  }),

  http.post('*/auth/logout', async () => {
    await delay(100)
    const { clearDemoSession } = useDemoAuthBackend()
    await clearDemoSession()
    return new HttpResponse(null, { status: 204 })
  }),

  http.post('*/auth/refresh', async () => {
    await delay(200)
    const { getDemoSession, setDemoSession } = useDemoAuthBackend()
    const session = await getDemoSession()
    if (!session) {
      return HttpResponse.json({ message: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    const tokens = tokensFor(session.user)
    await setDemoSession({ user: session.user, ...tokens })
    return HttpResponse.json(tokens)
  }),

  // ── OAuth token exchange ─────────────────────────────────
  http.post('*/auth/token', async ({ request }) => {
    await delay(300)
    const { setDemoSession } = useDemoAuthBackend()
    const body = (await request.json()) as Record<string, string>
    const code = body['code'] ?? ''
    // Do not reseed here: tests and local demos may intentionally clear the
    // store to assert that unresolved OAuth codes fail closed.
    const users = await getDemoUsers()

    // Deterministic mock code: demo-oauth-code-<provider>
    const providerMatch = code.match(/^demo-oauth-code-(.+)$/)
    let user: User | undefined
    if (providerMatch) {
      const provider = providerMatch[1] as User['provider']
      user = users.find((u) => u.provider === provider) ?? users[0]
    } else {
      // Fallback: treat code as email
      user = users.find((u) => u.email === code) ?? users[0]
    }

    if (!user) {
      return HttpResponse.json({ message: 'Unauthorized', code: 'INVALID_CODE' }, { status: 401 })
    }

    const tokens = tokensFor(user)
    await setDemoSession({ user, ...tokens })
    return HttpResponse.json({ user, ...tokens })
  }),

  // ── Social / OAuth provider redirects ───────────────────
  http.get('*/api/auth/:provider', ({ params }) => {
    const provider = params['provider'] as string
    const redirectUrl = new URL('/auth/callback', globalThis.location?.origin ?? 'http://localhost')
    redirectUrl.searchParams.set('code', `demo-oauth-code-${provider}`)
    redirectUrl.searchParams.set('state', 'mock')
    return HttpResponse.redirect(redirectUrl.toString())
  }),

  http.get('*/api/auth/:provider/callback', ({ params }) => {
    const provider = params['provider'] as string
    const redirectUrl = new URL('/auth/callback', globalThis.location?.origin ?? 'http://localhost')
    redirectUrl.searchParams.set('code', `demo-oauth-code-${provider}`)
    redirectUrl.searchParams.set('state', 'mock')
    return HttpResponse.redirect(redirectUrl.toString())
  }),
]
