import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import { useAuth } from '@/modules/auth/composables/useAuth'

import { createUser } from '../../fixtures'

/**
 * Where `useAuth().login` sends somebody once they are signed in.
 *
 * The rule itself is `safeRedirectPath` (see safe-redirect.test.ts); this is
 * that the sign-in flow goes through it, for the password step and the MFA
 * step alike.
 */

const signedIn = { user: createUser({ role: 'manager' }), token: 'opaque-access-token' }

/** The backend behind the configured adapter: a password step, then MFA if asked. */
function backend({ mfa }: { mfa: boolean }) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const { pathname } = new URL(input instanceof Request ? input.url : String(input))
    const body =
      pathname.endsWith('/auth/login') && mfa
        ? { ...signedIn, mfaRequired: true, mfaToken: 'challenge' }
        : signedIn
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

const page = { template: '<div />' }

async function signInFrom(url: string, { mfa = false } = {}) {
  backend({ mfa })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/auth/login', component: page },
      { path: '/dashboard', component: page },
      { path: '/dashboard/orders/:id', component: page },
      { path: '/:rest(.*)*', component: page },
    ],
  })
  await router.push(url)
  await router.isReady()

  let auth!: ReturnType<typeof useAuth>
  const Harness = defineComponent({
    setup() {
      auth = useAuth()
      return () => h('div')
    },
  })
  mount(Harness, { global: { plugins: [router] } })

  await auth.login({ email: 'ada@example.test', password: 'pw' })
  if (mfa) await auth.verifyMfaCode('000000')
  return router.currentRoute.value.fullPath
}

describe('the redirect after signing in', () => {
  it('returns to the page the visitor was sent from, query and hash included', async () => {
    const destination = '/dashboard/orders/42?tab=items#notes'

    await expect(
      signInFrom(`/auth/login?redirect=${encodeURIComponent(destination)}&reason=expired`),
    ).resolves.toBe(destination)
  })

  it('goes to the dashboard when no destination was given', async () => {
    await expect(signInFrom('/auth/login')).resolves.toBe('/dashboard')
  })

  it.each([
    ['another origin', 'https://example.org/x'],
    ['a protocol-relative URL', '//example.org/x'],
    ['an encoded backslash', '/%5Cexample.org'],
    ['an encoded TAB', '/%09/example.org'],
    ['a javascript: URL', 'javascript:alert(1)'],
  ])('goes to the dashboard instead of %s', async (_, hostile) => {
    await expect(signInFrom(`/auth/login?redirect=${encodeURIComponent(hostile)}`)).resolves.toBe(
      '/dashboard',
    )
  })

  it('applies the same rule after an MFA challenge', async () => {
    await expect(
      signInFrom('/auth/login?redirect=%2Fdashboard%2Forders%2F7', { mfa: true }),
    ).resolves.toBe('/dashboard/orders/7')
    await expect(signInFrom('/auth/login?redirect=%2F%2Fexample.org', { mfa: true })).resolves.toBe(
      '/dashboard',
    )
  })
})
