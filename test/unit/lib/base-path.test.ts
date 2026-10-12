import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { appBasePath, appPath, appPathname, appUrl, stripAppBase } from '~/lib/config/base-path'

/**
 * The one place the app turns "a path inside the app" into "a URL the browser
 * asks for". Under a base path those differ by the prefix, and every URL the
 * router does not write itself goes through here: `version.json`, the OAuth
 * redirect URI, the docs-path check before the router exists.
 *
 * Vite's `base` is the source of truth, read from `import.meta.env.BASE_URL`.
 */

const under = (base: string) => vi.stubEnv('BASE_URL', base)

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  window.history.replaceState({}, '', '/')
})

describe('appBasePath', () => {
  it('is the root when the app is built with no base', () => {
    expect(appBasePath()).toBe('/')
  })

  it("is Vite's base, which the build set from VUESTRATA_BASE_PATH", () => {
    under('/console/')
    expect(appBasePath()).toBe('/console/')

    under('/apps/console/')
    expect(appBasePath()).toBe('/apps/console/')
  })

  it('always ends with a slash', () => {
    under('/console')
    expect(appBasePath()).toBe('/console/')
  })

  // Only a project's own Vite config can set these; a URL cannot be built
  // under either, and the app must not hand one to an identity provider.
  it.each([
    ['a relative base', './'],
    ['an empty base', ''],
    ['a CDN', 'https://cdn.example.com/console/'],
    ['a protocol-relative URL', '//cdn.example.com/console/'],
    ['a base with a parent segment', '/a/../b/'],
  ])('reads %s as the root', (_name, base) => {
    under(base)
    expect(appBasePath()).toBe('/')
  })
})

describe('appPath', () => {
  it('returns a path as given when the app is at the root', () => {
    expect(appPath('/version.json')).toBe('/version.json')
    expect(appPath('version.json')).toBe('/version.json')
    expect(appPath('/auth/callback?x=1#y')).toBe('/auth/callback?x=1#y')
    expect(appPath('/')).toBe('/')
    expect(appPath('')).toBe('/')
  })

  it('puts the prefix in front once, with one slash where they meet', () => {
    under('/console/')

    expect(appPath('/version.json')).toBe('/console/version.json')
    expect(appPath('version.json')).toBe('/console/version.json')
    expect(appPath('/auth/callback')).toBe('/console/auth/callback')
    expect(appPath('/')).toBe('/console/')
    expect(appPath('')).toBe('/console/')
    expect(appPath('/dashboard/orders?tab=open#notes')).toBe(
      '/console/dashboard/orders?tab=open#notes',
    )
  })

  it('never produces two slashes in a row at the join, under any base', () => {
    for (const base of ['/', '/console/', '/a/b/']) {
      under(base)
      for (const path of ['', '/', 'x', '/x', '/x/y']) {
        expect(appPath(path), `${base} + ${path}`).not.toMatch(/\/\//)
      }
    }
  })

  it('takes its input as a path inside the app: a route that repeats the prefix is kept', () => {
    // `/console/reports` is a legitimate route of an app mounted at /console/.
    under('/console/')
    expect(appPath('/console/reports')).toBe('/console/console/reports')
  })

  it.each([
    ['an absolute URL', 'https://evil.example/x'],
    ['a protocol-relative URL', '//evil.example/x'],
    ['a backslash spelling of one', '/\\evil.example/x'],
    ['two backslashes', '\\\\evil.example/x'],
    ['a backslash further in', '/a\\b'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a data: URL', 'data:text/html,x'],
    ['a TAB a browser would strip', '/\t/evil.example'],
    ['a line break', '/a\nb'],
  ])('throws for %s rather than prefixing it', (_name, input) => {
    under('/console/')
    expect(() => appPath(input)).toThrow(TypeError)
    expect(() => appUrl(input)).toThrow(TypeError)
  })

  it('throws for something that is not a string', () => {
    expect(() => appPath(undefined as unknown as string)).toThrow(TypeError)
  })
})

describe('appUrl', () => {
  it('is the path on the origin of the page when the app is at the root', () => {
    expect(appUrl('/auth/callback')).toBe(`${window.location.origin}/auth/callback`)
  })

  it('carries the prefix: the address the router answers under a base path', () => {
    vi.stubGlobal('location', { origin: 'https://portal.example.test' })
    under('/console/')

    expect(appUrl('/auth/callback')).toBe('https://portal.example.test/console/auth/callback')
    expect(appUrl('auth/callback')).toBe('https://portal.example.test/console/auth/callback')
    expect(appUrl('/')).toBe('https://portal.example.test/console/')
  })

  it('stays on the origin of the page whatever it is given', () => {
    vi.stubGlobal('location', { origin: 'https://portal.example.test' })
    under('/console/')

    for (const path of ['/x', 'x', '/@evil.example/x', '/x?next=https://evil.example']) {
      expect(new URL(appUrl(path)).origin).toBe('https://portal.example.test')
      expect(new URL(appUrl(path)).pathname.startsWith('/console/')).toBe(true)
    }
  })
})

describe('stripAppBase', () => {
  it('returns the pathname as it is when the app is at the root', () => {
    expect(stripAppBase('/docs/intro')).toBe('/docs/intro')
    expect(stripAppBase('/')).toBe('/')
  })

  it('takes the prefix off, leaving the path the router uses', () => {
    under('/console/')

    expect(stripAppBase('/console/docs/intro')).toBe('/docs/intro')
    expect(stripAppBase('/console/')).toBe('/')
    expect(stripAppBase('/console')).toBe('/')
  })

  it('takes it off once, and only as a whole segment', () => {
    under('/console/')

    expect(stripAppBase('/console/console/x')).toBe('/console/x')
    // Another app that happens to start with the same letters.
    expect(stripAppBase('/console-admin/docs')).toBe('/console-admin/docs')
    expect(stripAppBase('/docs/intro')).toBe('/docs/intro')
  })

  it('does not mistake a base called /docs/ for the in-app docs', () => {
    under('/docs/')

    expect(stripAppBase('/docs/dashboard')).toBe('/dashboard')
    expect(stripAppBase('/docs/docs/intro')).toBe('/docs/intro')
  })
})

describe('appPathname', () => {
  it('is the address bar without the prefix', () => {
    under('/console/')
    window.history.replaceState({}, '', '/console/docs/theming/overview?x=1')

    expect(appPathname()).toBe('/docs/theming/overview')
  })

  it('is the address bar itself at the root', () => {
    window.history.replaceState({}, '', '/docs/theming/overview')

    expect(appPathname()).toBe('/docs/theming/overview')
  })
})
