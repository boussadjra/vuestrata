import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test'

import {
  csrfPresets,
  DEFAULT_CSRF_STRATEGY,
  getCsrfToken,
  invalidateCsrfToken,
  primeCsrfToken,
  readCsrfToken,
  type CsrfStrategy,
} from '@/lib/api/csrf'

/**
 * The CSRF strategies, against a real (jsdom) document: a meta tag in `<head>`
 * and `document.cookie`, which is exactly where a browser keeps them.
 */

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())

function setMeta(name: string, content: string) {
  const tag = document.createElement('meta')
  tag.setAttribute('name', name)
  tag.setAttribute('content', content)
  document.head.append(tag)
}

function clearCookies() {
  for (const pair of document.cookie.split(';')) {
    const name = pair.split('=')[0]?.trim()
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  }
}

afterEach(() => {
  server.resetHandlers()
  for (const tag of document.head.querySelectorAll('meta[name]')) tag.remove()
  clearCookies()
})

describe('the default strategy', () => {
  it('is the meta tag the client always read, sent as X-CSRF-Token', () => {
    expect(DEFAULT_CSRF_STRATEGY).toEqual({
      source: 'meta',
      name: 'csrf-token',
      header: 'X-CSRF-Token',
    })
    expect(csrfPresets.rails).toBe(DEFAULT_CSRF_STRATEGY)
  })

  it('reads the token from <meta name="csrf-token">', () => {
    expect(readCsrfToken(DEFAULT_CSRF_STRATEGY)).toBeNull()

    setMeta('csrf-token', 'meta-token-1')

    expect(readCsrfToken(DEFAULT_CSRF_STRATEGY)).toBe('meta-token-1')
  })

  it('caches the meta token until it is invalidated', () => {
    setMeta('csrf-token', 'meta-token-1')
    expect(getCsrfToken(DEFAULT_CSRF_STRATEGY)).toBe('meta-token-1')

    // The server re-rendered the tag; the cached value is still what is sent…
    document.head.querySelector('meta[name="csrf-token"]')!.setAttribute('content', 'meta-token-2')
    expect(getCsrfToken(DEFAULT_CSRF_STRATEGY)).toBe('meta-token-1')

    // …until something (a 403) says it is stale.
    invalidateCsrfToken()
    expect(getCsrfToken(DEFAULT_CSRF_STRATEGY)).toBe('meta-token-2')
  })

  it('caches a miss too, which is why the client re-reads before a write', () => {
    expect(getCsrfToken(DEFAULT_CSRF_STRATEGY)).toBeNull()

    setMeta('csrf-token', 'late-token')
    expect(getCsrfToken(DEFAULT_CSRF_STRATEGY)).toBeNull()

    invalidateCsrfToken()
    expect(getCsrfToken(DEFAULT_CSRF_STRATEGY)).toBe('late-token')
  })

  it('reads a meta tag by another name, without treating the name as a selector', () => {
    const strategy: CsrfStrategy = { source: 'meta', name: 'x"] , meta[name="other', header: 'X' }
    setMeta('other', 'wrong-token')

    expect(readCsrfToken(strategy)).toBeNull()

    setMeta('_csrf', 'right-token')
    expect(readCsrfToken({ source: 'meta', name: '_csrf', header: 'X-CSRF' })).toBe('right-token')
  })
})

describe('the cookie strategies', () => {
  it('django reads csrftoken, among other cookies, for X-CSRFToken', () => {
    document.cookie = 'theme=dark; path=/'
    document.cookie = 'csrftoken=dj4ng0T0ken; path=/'
    document.cookie = 'csrftoken_legacy=not-this-one; path=/'

    expect(csrfPresets.django.header).toBe('X-CSRFToken')
    expect(readCsrfToken(csrfPresets.django)).toBe('dj4ng0T0ken')
  })

  it('spring reads XSRF-TOKEN as it is', () => {
    document.cookie = 'XSRF-TOKEN=5c9d1a3e-8f1b-4e0c-9a55-0d6d3f6a1b2c; path=/'

    expect(csrfPresets.spring).toEqual({
      source: 'cookie',
      name: 'XSRF-TOKEN',
      header: 'X-XSRF-TOKEN',
    })
    expect(readCsrfToken(csrfPresets.spring)).toBe('5c9d1a3e-8f1b-4e0c-9a55-0d6d3f6a1b2c')
  })

  it('laravel percent-decodes its cookie before it goes into the header', () => {
    // Laravel's cookie is base64 JSON, and its `=` padding arrives as %3D.
    document.cookie = 'XSRF-TOKEN=eyJpdiI6IkFiQyJ9%3D%3D; path=/'

    expect(csrfPresets.laravel).toMatchObject({
      source: 'cookie',
      name: 'XSRF-TOKEN',
      header: 'X-XSRF-TOKEN',
      prime: '/sanctum/csrf-cookie',
    })
    expect(readCsrfToken(csrfPresets.laravel)).toBe('eyJpdiI6IkFiQyJ9==')
    // Without the decode step the server would compare against the raw value.
    expect(readCsrfToken({ ...csrfPresets.laravel, decode: undefined })).toBe(
      'eyJpdiI6IkFiQyJ9%3D%3D',
    )
  })

  it('reads a value that contains "=" whole', () => {
    document.cookie = 'token=a=b=c; path=/'

    expect(readCsrfToken({ source: 'cookie', name: 'token', header: 'X' })).toBe('a=b=c')
  })

  it('answers null for a cookie that cannot be decoded', () => {
    document.cookie = 'XSRF-TOKEN=%E0%A4%A; path=/'

    expect(readCsrfToken(csrfPresets.laravel)).toBeNull()
  })

  it('is never cached: the backend rewrites the cookie when it likes', () => {
    document.cookie = 'csrftoken=before-login; path=/'
    expect(getCsrfToken(csrfPresets.django)).toBe('before-login')

    document.cookie = 'csrftoken=after-login; path=/'
    expect(getCsrfToken(csrfPresets.django)).toBe('after-login')
  })

  it('answers null when the cookie is absent', () => {
    expect(readCsrfToken(csrfPresets.django)).toBeNull()
    expect(getCsrfToken(csrfPresets.django)).toBeNull()
  })
})

describe('no strategy', () => {
  it('reads nothing and primes nothing', async () => {
    setMeta('csrf-token', 'ignored')
    document.cookie = 'XSRF-TOKEN=ignored; path=/'

    expect(readCsrfToken(csrfPresets.none)).toBeNull()
    expect(getCsrfToken(csrfPresets.none)).toBeNull()
    expect(await primeCsrfToken(csrfPresets.none, 'http://localhost/api')).toBe(false)
  })
})

describe('without a document', () => {
  it('answers null instead of throwing', () => {
    vi.stubGlobal('document', undefined)
    try {
      expect(readCsrfToken(DEFAULT_CSRF_STRATEGY)).toBeNull()
      expect(readCsrfToken(csrfPresets.django)).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('priming', () => {
  it('does nothing for a strategy without a prime step', async () => {
    expect(await primeCsrfToken(csrfPresets.django, 'http://localhost/api')).toBe(false)
  })

  it('GETs the prime URL with cookies, from the API origin and not under its path', async () => {
    const seen: { url: string; credentials: RequestCredentials; method: string }[] = []
    server.use(
      http.get('*/sanctum/csrf-cookie', ({ request }) => {
        seen.push({ url: request.url, credentials: request.credentials, method: request.method })
        // What the Set-Cookie header would do in a browser.
        document.cookie = 'XSRF-TOKEN=primed%3D; path=/'
        return new HttpResponse(null, { status: 204 })
      }),
    )

    expect(await primeCsrfToken(csrfPresets.laravel, 'https://api.acme.test/api')).toBe(true)

    expect(seen).toEqual([
      { url: 'https://api.acme.test/sanctum/csrf-cookie', credentials: 'include', method: 'GET' },
    ])
    expect(getCsrfToken(csrfPresets.laravel)).toBe('primed=')
  })

  it('resolves a relative prime URL under the API path', async () => {
    const seen: string[] = []
    server.use(
      http.get('*/csrf', ({ request }) => {
        seen.push(request.url)
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const strategy: CsrfStrategy = { ...csrfPresets.spring, prime: 'csrf' }

    await primeCsrfToken(strategy, 'https://api.acme.test/api')
    await primeCsrfToken(strategy, 'https://api.acme.test/api/')

    expect(seen).toEqual(['https://api.acme.test/api/csrf', 'https://api.acme.test/api/csrf'])
  })

  it('forgets a cached meta token once primed, so the new one is read', async () => {
    setMeta('csrf-token', 'stale')
    const strategy: CsrfStrategy = {
      ...DEFAULT_CSRF_STRATEGY,
      prime: async () => {
        document.head.querySelector('meta[name="csrf-token"]')!.setAttribute('content', 'fresh')
      },
    }
    expect(getCsrfToken(strategy)).toBe('stale')

    expect(await primeCsrfToken(strategy, 'http://localhost/api')).toBe(true)

    expect(getCsrfToken(strategy)).toBe('fresh')
  })

  it('hands a prime function the API base URL', async () => {
    const prime = vi.fn().mockResolvedValue(undefined)

    await primeCsrfToken({ ...csrfPresets.django, prime }, 'https://api.acme.test/v1')

    expect(prime).toHaveBeenCalledWith({ baseURL: 'https://api.acme.test/v1' })
  })

  it('answers false, and does not throw, when the prime request fails', async () => {
    server.use(http.get('*/sanctum/csrf-cookie', () => new HttpResponse(null, { status: 500 })))
    expect(await primeCsrfToken(csrfPresets.laravel, 'https://api.acme.test/api')).toBe(false)

    server.use(http.get('*/sanctum/csrf-cookie', () => HttpResponse.error()))
    expect(await primeCsrfToken(csrfPresets.laravel, 'https://api.acme.test/api')).toBe(false)

    const broken: CsrfStrategy = {
      ...csrfPresets.django,
      prime: async () => {
        throw new Error('no network')
      },
    }
    expect(await primeCsrfToken(broken, 'http://localhost/api')).toBe(false)
  })
})
