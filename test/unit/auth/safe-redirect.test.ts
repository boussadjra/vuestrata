import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { safeRedirectPath } from '@/modules/auth/lib/safe-redirect'

/**
 * The `redirect` query parameter decides where somebody lands straight after
 * typing their password, and anybody can write a link that carries one. Only a
 * path inside the app may come out of this function.
 */

const FALLBACK = '/dashboard'

describe('safeRedirectPath', () => {
  it.each([
    ['/dashboard'],
    ['/'],
    ['/dashboard/orders/42'],
    ['/dashboard/orders/42?tab=items#notes'],
    ['/dashboard/orders?tab=open&sort=-created'],
    ['/dashboard/reports#summary'],
    // An encoded slash or space inside a path or a query is still in the app.
    ['/dashboard/search?q=a%20b'],
    ['/dashboard/files/a%2Fb'],
    ['/dashboard/search?next=%2Fdashboard%2Forders'],
    ['/dashboard/caf%C3%A9'],
  ])('keeps the in-app path %j', (path) => {
    expect(safeRedirectPath(path)).toBe(path)
  })

  it.each([
    // Another origin, spelled every way a browser accepts.
    ['an absolute URL', 'https://example.org/x'],
    ['a protocol-relative URL', '//example.org/x'],
    ['an encoded protocol-relative URL', '%2F%2Fexample.org%2Fx'],
    ['encoded backslashes', '%5C%5Cexample.org'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a leading space', ' //example.org'],
    ['an encoded backslash after the slash', '/%5Cexample.org'],
    ['an encoded TAB between the slashes', '/%09/example.org'],
    ['an encoded LF between encoded slashes', '%2F%0A%2Fexample.org'],
    ['a scheme with no slashes', 'http:example.org'],
    ['a backslash after the slash', '/\\example.org'],
    // The same tricks, unencoded and further in.
    ['a TAB between the slashes', '/\t/example.org'],
    ['a LF between the slashes', '/\n/example.org'],
    ['a CR between the slashes', '/\r/example.org'],
    ['a leading backslash', '\\\\example.org'],
    ['a backslash further in', '/dashboard\\..\\example.org'],
    ['an encoded second slash', '/%2Fexample.org'],
    ['an encoded CR in a query', '/dashboard?x=%0D'],
    ['a NUL', '/dashboard\u0000'],
    ['a DEL', '/dashboard\u007f'],
    ['a same-origin absolute URL', `${window.location.origin}/dashboard`],
    ['a relative path', 'dashboard'],
    ['a data: URL', 'data:text/html,<script>alert(1)</script>'],
    ['an encoding that does not decode', '/dashboard/%E0%A4%A'],
    ['an empty string', ''],
  ])('refuses %s', (_, value) => {
    expect(safeRedirectPath(value)).toBe(FALLBACK)
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a repeated parameter', ['/dashboard/a', '/dashboard/b']],
    ['a number', 42],
    ['an object', { path: '/dashboard' }],
  ])('refuses %s, which is not a string', (_, value) => {
    expect(safeRedirectPath(value)).toBe(FALLBACK)
  })

  it('falls back to the route it is given', () => {
    expect(safeRedirectPath('//example.org', '/')).toBe('/')
    expect(safeRedirectPath(undefined, '/dashboard/account')).toBe('/dashboard/account')
  })

  it('returns the value as it was written, not its decoded form', () => {
    expect(safeRedirectPath('/dashboard/files/a%2Fb')).toBe('/dashboard/files/a%2Fb')
  })
})

/**
 * Under `VUESTRATA_BASE_PATH=/console/` the value is still a path INSIDE the
 * app. The route guard and the expiry redirect write `route.fullPath`, which
 * never holds the prefix, and `useAuth` hands the result to `router.push`,
 * which adds it. So this function neither adds nor removes anything, and what
 * it lets through is what it let through at the root. (That the router does
 * not double the prefix is in test/unit/app/base-path.test.ts.)
 */
describe('safeRedirectPath, for an app served under a base path', () => {
  const stubBase = () => vi.stubEnv('BASE_URL', '/console/')

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('keeps an in-app path as it is, without a prefix', () => {
    stubBase()
    expect(safeRedirectPath('/dashboard/users')).toBe('/dashboard/users')
    expect(safeRedirectPath('/')).toBe('/')
  })

  it('does not strip a prefix someone wrote into the value: that is a route of its own', () => {
    stubBase()
    // router.push('/console/x') under the base is /console/console/x: an
    // unknown route inside the app, not a way out of it.
    expect(safeRedirectPath('/console/dashboard')).toBe('/console/dashboard')
  })

  it.each([
    ['a protocol-relative URL', '//evil.example/console/'],
    ['one that starts like the base', '//console/evil.example'],
    ['a backslash spelling', '/\\evil.example/console/'],
    ['an encoded one', '%2F%2Fevil.example%2Fconsole%2F'],
    ['an absolute URL under the same prefix', 'https://evil.example/console/dashboard'],
    ['a TAB between the slashes', '/\t/evil.example'],
  ])('still refuses %s', (_, value) => {
    stubBase()
    expect(safeRedirectPath(value)).toBe(FALLBACK)
  })
})
