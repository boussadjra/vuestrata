import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vite-plus/test'

import { removeAppLoader } from '@/bootstrap/app-loader'
import { renderBootFailure } from '@/bootstrap/boot-error'
import {
  AppError,
  installErrorReporter,
  resetErrorReporter,
  transportError,
  type ErrorReporter,
} from '@/lib/errors'
import { logger } from '@/lib/logger'
import { APPEARANCE_KEYS } from '@/plugins/appearance'

/**
 * The screen a visitor gets when `boot()` fails.
 *
 * It renders without Vue, i18n or the app's stylesheet, so every assertion here
 * reads plain DOM. The failure it replaces was a spinner that turned forever.
 */

let reporter: ErrorReporter & { captureException: Mock<ErrorReporter['captureException']> }
let loggerError: ReturnType<typeof vi.spyOn>

function mountPage({ app = true, loader = true } = {}) {
  document.body.innerHTML =
    (app ? '<div id="app"><p id="partial">half-mounted</p></div>' : '') +
    (loader ? '<div id="app-loader"></div>' : '')
}

function stubLanguages(languages: string[]) {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages)
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(languages[0] ?? '')
}

const screen = () => document.getElementById('boot-failure')
const text = () => screen()?.textContent ?? ''

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
  stubLanguages(['en-US'])
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) => ({ matches: false, media: query }) as MediaQueryList,
  )

  reporter = {
    name: 'test',
    captureException: vi.fn<ErrorReporter['captureException']>(),
    setUser: vi.fn(),
  }
  installErrorReporter(reporter)
  loggerError = vi.spyOn(logger, 'error').mockImplementation(() => undefined)
  mountPage()
})

afterEach(() => {
  resetErrorReporter()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('renderBootFailure', () => {
  it('logs the failure and reports it with source "bootstrap"', () => {
    const failure = new Error('boom')

    renderBootFailure(failure)

    expect(loggerError).toHaveBeenCalledTimes(1)
    expect(loggerError).toHaveBeenCalledWith('Bootstrap failed:', { err: failure })
    expect(reporter.captureException).toHaveBeenCalledTimes(1)
    expect(reporter.captureException).toHaveBeenCalledWith(failure, { source: 'bootstrap' })
  })

  it('removes the loader at once, without waiting for a transition', () => {
    vi.useFakeTimers()

    renderBootFailure(new Error('boom'))

    // No timers advanced, no transitionend fired.
    expect(document.getElementById('app-loader')).toBeNull()
    vi.useRealTimers()
  })

  it('renders a static alert into #app, replacing what was there', () => {
    renderBootFailure(new Error('boom'))

    expect(document.getElementById('partial')).toBeNull()
    expect(screen()?.parentElement?.id).toBe('app')
    // A landmark with the alert inside it, like every other page.
    expect(screen()?.tagName).toBe('MAIN')
    expect(screen()?.querySelector('[role="alert"] h1')?.textContent).toBe('Something went wrong')
    expect(screen()?.querySelector('button')?.textContent).toBe('Reload page')
  })

  it('moves focus to the heading', () => {
    renderBootFailure(new Error('boom'))

    expect(document.activeElement).toBe(screen()?.querySelector('h1'))
  })

  it('keeps the technical detail in a collapsed <details>', () => {
    renderBootFailure(new TypeError('the adapter is misconfigured'))

    const details = screen()?.querySelector('details')
    expect(details).not.toBeNull()
    expect(details?.open).toBe(false)
    expect(details?.querySelector('pre')?.textContent).toBe(
      'TypeError: the adapter is misconfigured',
    )
  })
})

describe('what it will not show', () => {
  it('never puts a stack in the page', () => {
    const failure = new Error('kaboom')
    failure.stack =
      'Error: kaboom\n    at secretFunction (https://app.example.com/assets/index-a1b2.js:1:2)'

    renderBootFailure(failure)

    expect(text()).not.toContain('secretFunction')
    expect(text()).not.toContain('index-a1b2')
    expect(document.body.innerHTML).not.toContain('secretFunction')
  })

  it('cuts URLs and query strings out of the message', () => {
    renderBootFailure(
      new Error('GET https://api.example.com/users?token=abc123 failed, retry /x?session=9'),
    )

    expect(text()).not.toContain('api.example.com')
    expect(text()).not.toContain('abc123')
    expect(text()).not.toContain('session=9')
    expect(text()).toContain('[url]')
  })

  it('cuts a relative URL out whole, fragment included', () => {
    // An OAuth callback's token travels in the fragment, on a relative URL.
    renderBootFailure(
      new Error('Redirect to /callback#access_token=SECRETTOKEN&state=xyz was refused'),
    )

    expect(text()).not.toContain('SECRETTOKEN')
    expect(text()).not.toContain('access_token')
    expect(text()).not.toContain('/callback')
    expect(screen()?.querySelector('pre')?.textContent).toBe(
      'Error: Redirect to [path] was refused',
    )
  })

  it('drops a fragment or a query left on a word that is not a path', () => {
    renderBootFailure(new Error('callback#access_token=SECRETTOKEN and state?session=9 failed'))

    expect(text()).not.toContain('SECRETTOKEN')
    expect(text()).not.toContain('session=9')
    expect(screen()?.querySelector('pre')?.textContent).toBe('Error: callback and state failed')
  })

  it('cuts protocol-relative hosts, file paths and data: URIs out', () => {
    renderBootFailure(
      new Error(
        'Load //cdn.internal.example/app.js from C:\\Users\\jane\\app or data:text/html;base64,U0VDUkVU failed',
      ),
    )

    expect(text()).not.toContain('cdn.internal.example')
    expect(text()).not.toContain('jane')
    expect(text()).not.toContain('U0VDUkVU')
    expect(screen()?.querySelector('pre')?.textContent).toBe(
      'Error: Load [path] from [path] or [url] failed',
    )
  })

  it('keeps the word "data:" when it is not a URI', () => {
    renderBootFailure(new Error('Invalid data: the seed is empty'))

    expect(screen()?.querySelector('pre')?.textContent).toBe(
      'Error: Invalid data: the seed is empty',
    )
  })

  it('cuts a response body out of the first line', () => {
    renderBootFailure(
      new Error('Unexpected response: {"password":"hunter2","user":{"email":"jane@example.com"}}'),
    )
    expect(text()).not.toContain('hunter2')
    expect(text()).not.toContain('jane@example.com')
    expect(screen()?.querySelector('pre')?.textContent).toBe('Error: Unexpected response:')

    renderBootFailure(new Error('Unexpected rows ["hunter2","s3cret"] in the seed'))
    expect(text()).not.toContain('hunter2')
    expect(screen()?.querySelector('pre')?.textContent).toBe('Error: Unexpected rows')
  })

  it('shows the code and status of a failed request, never its message', () => {
    // A 4xx `AppError` carries the `message` field of the server's response.
    renderBootFailure(
      new AppError({
        message: 'No account for jane@example.com in tenant acme-internal',
        code: 'ACCOUNT_NOT_FOUND',
        status: 404,
        kind: 'http',
      }),
    )

    expect(text()).not.toContain('jane@example.com')
    expect(text()).not.toContain('acme-internal')
    expect(screen()?.querySelector('pre')?.textContent).toBe(
      'AppError: ACCOUNT_NOT_FOUND (status 404)',
    )
  })

  it('shows no status for a request that never got a response', () => {
    renderBootFailure(transportError('network'))

    expect(screen()?.querySelector('pre')?.textContent).toBe('AppError: NETWORK_ERROR')
  })

  it('treats an HTTP client error like the request failure it is', () => {
    // What ofetch throws: the URL is in the message and the body is on `data`.
    const failure = Object.assign(
      new Error('[GET] "https://api.example.com/me?token=abc123": 401 Unauthorized'),
      {
        name: 'FetchError',
        response: { status: 401 },
        data: { message: 'Token abc123 has expired', code: 'TOKEN_EXPIRED' },
      },
    )

    renderBootFailure(failure)

    expect(text()).not.toContain('abc123')
    expect(text()).not.toContain('api.example.com')
    expect(screen()?.querySelector('pre')?.textContent).toBe(
      'FetchError: TOKEN_EXPIRED (status 401)',
    )
  })

  it('drops a request code that is not a plain token', () => {
    renderBootFailure(
      new AppError({ message: 'x', code: 'see https://idp.example.com/?t=1', status: 400 }),
    )

    expect(text()).not.toContain('idp.example.com')
    expect(screen()?.querySelector('pre')?.textContent).toBe('AppError: status 400')
  })

  it('falls back to "Error" for a name that is not a class name', () => {
    const failure = new Error('boom')
    failure.name = 'see /callback#access_token=SECRETTOKEN'

    renderBootFailure(failure)

    expect(text()).not.toContain('SECRETTOKEN')
    expect(screen()?.querySelector('pre')?.textContent).toBe('Error: boom')
  })

  it('shows only the first line of a multi-line message', () => {
    renderBootFailure(new Error('first line\nsecond line with a response body: {"secret":1}'))

    expect(text()).toContain('first line')
    expect(text()).not.toContain('response body')
  })

  it('truncates a very long message', () => {
    renderBootFailure(new Error('x'.repeat(5000)))

    expect(screen()?.querySelector('pre')?.textContent?.length).toBeLessThan(250)
  })

  it('does not render markup from the message as markup', () => {
    renderBootFailure(new Error('<img src=x onerror=alert(1)>'))

    expect(screen()?.querySelector('img')).toBeNull()
    expect(text()).toContain('<img src=x')
  })

  it('describes a thrown string, and a thrown nothing, without inventing detail', () => {
    renderBootFailure('a plain string')
    expect(screen()?.querySelector('pre')?.textContent).toBe('Error: a plain string')

    renderBootFailure(undefined)
    expect(screen()?.querySelector('pre')?.textContent).toBe('Error')
  })
})

describe('it never throws', () => {
  it('creates a container when the page has no #app', () => {
    mountPage({ app: false })

    expect(() => renderBootFailure(new Error('boom'))).not.toThrow()

    expect(screen()?.parentElement?.id).toBe('app')
    expect(document.getElementById('app-loader')).toBeNull()
  })

  it('works when there is no loader either', () => {
    mountPage({ loader: false })

    expect(() => renderBootFailure(new Error('boom'))).not.toThrow()
    expect(screen()).not.toBeNull()
  })

  it.each([
    ['an Error', new Error('boom')],
    ['a string', 'a string, not an Error'],
    ['undefined', undefined],
    ['null', null],
    ['an object', { code: 42 }],
    [
      'an error whose message getter throws',
      Object.defineProperty(new Error('x'), 'message', {
        get() {
          throw new Error('nested')
        },
      }),
    ],
  ])('accepts %s', (_label, failure) => {
    expect(() => renderBootFailure(failure)).not.toThrow()
    expect(screen()).not.toBeNull()
    expect(document.getElementById('app-loader')).toBeNull()
  })

  it('still shows the screen when the logger throws', () => {
    loggerError.mockImplementation(() => {
      throw new Error('logger down')
    })

    expect(() => renderBootFailure(new Error('boom'))).not.toThrow()
    expect(screen()).not.toBeNull()
  })

  it('still shows the screen when the reporter throws', () => {
    reporter.captureException.mockImplementation(() => {
      throw new Error('reporter down')
    })

    expect(() => renderBootFailure(new Error('boom'))).not.toThrow()
    expect(screen()).not.toBeNull()
  })

  it('still takes the loader down when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })

    expect(() => renderBootFailure(new Error('boom'))).not.toThrow()
    expect(screen()).not.toBeNull()
    expect(document.getElementById('app-loader')).toBeNull()
  })
})

describe('language and direction', () => {
  it('uses English by default', () => {
    renderBootFailure(new Error('boom'))

    expect(screen()?.lang).toBe('en')
    expect(screen()?.dir).toBe('ltr')
  })

  it('uses the persisted locale', () => {
    localStorage.setItem(APPEARANCE_KEYS.locale, 'fr')

    renderBootFailure(new Error('boom'))

    expect(screen()?.lang).toBe('fr')
    expect(screen()?.dir).toBe('ltr')
    expect(screen()?.querySelector('button')?.textContent).toBe('Recharger la page')
  })

  it('is right-to-left for Arabic', () => {
    localStorage.setItem(APPEARANCE_KEYS.locale, 'ar')

    renderBootFailure(new Error('boom'))

    expect(screen()?.lang).toBe('ar')
    expect(screen()?.dir).toBe('rtl')
    expect(screen()?.querySelector('button')?.textContent).toBe('إعادة تحميل الصفحة')
  })

  it('falls back to the browser language when nothing is persisted', () => {
    stubLanguages(['ar-EG', 'en'])

    renderBootFailure(new Error('boom'))

    expect(screen()?.lang).toBe('ar')
  })

  it('picks the first language the browser lists that it can show', () => {
    stubLanguages(['de-DE', 'fr-CA', 'en-US'])

    renderBootFailure(new Error('boom'))

    expect(screen()?.lang).toBe('fr')
  })

  it('prefers the persisted locale to the browser language', () => {
    localStorage.setItem(APPEARANCE_KEYS.locale, 'en')
    stubLanguages(['fr-FR'])

    renderBootFailure(new Error('boom'))

    expect(screen()?.lang).toBe('en')
  })

  it('ignores a persisted value it has no strings for', () => {
    localStorage.setItem(APPEARANCE_KEYS.locale, 'de')
    stubLanguages(['fr-FR'])

    renderBootFailure(new Error('boom'))

    expect(screen()?.lang).toBe('fr')
  })

  it('falls back to English for a language it has no strings for', () => {
    stubLanguages(['ja-JP'])

    renderBootFailure(new Error('boom'))

    expect(screen()?.lang).toBe('en')
  })
})

describe('removeAppLoader', () => {
  const loader = () => document.getElementById('app-loader')

  it('fades the splash out, then removes it', () => {
    vi.useFakeTimers()

    removeAppLoader()

    expect(loader()?.style.opacity).toBe('0')
    loader()?.dispatchEvent(new Event('transitionend'))
    expect(loader()).toBeNull()
    vi.useRealTimers()
  })

  it('removes it anyway when the transition never ends', () => {
    vi.useFakeTimers()

    removeAppLoader()
    expect(loader()).not.toBeNull()

    vi.advanceTimersByTime(500)
    expect(loader()).toBeNull()
    vi.useRealTimers()
  })

  it('skips the fade for a visitor who asked for reduced motion', () => {
    vi.mocked(window.matchMedia).mockImplementation(
      (query: string) => ({ matches: query.includes('reduce'), media: query }) as MediaQueryList,
    )

    removeAppLoader()

    expect(loader()).toBeNull()
  })

  it('skips the fade when asked to remove it at once', () => {
    removeAppLoader({ immediate: true })

    expect(loader()).toBeNull()
  })

  it('does nothing on a page without one', () => {
    mountPage({ loader: false })

    expect(() => removeAppLoader()).not.toThrow()
  })
})

describe('colour scheme', () => {
  it('is light by default', () => {
    renderBootFailure(new Error('boom'))
    expect(screen()?.dataset.scheme).toBe('light')
  })

  it('follows the dark class the appearance bootstrap set', () => {
    document.documentElement.classList.add('dark')
    renderBootFailure(new Error('boom'))
    expect(screen()?.dataset.scheme).toBe('dark')
  })

  it('follows the stored preference when the class was never applied', () => {
    localStorage.setItem(APPEARANCE_KEYS.dark, 'true')
    renderBootFailure(new Error('boom'))
    expect(screen()?.dataset.scheme).toBe('dark')
  })

  it('follows prefers-color-scheme when nothing is stored', () => {
    vi.mocked(window.matchMedia).mockImplementation(
      (query: string) => ({ matches: query.includes('dark'), media: query }) as MediaQueryList,
    )
    renderBootFailure(new Error('boom'))
    expect(screen()?.dataset.scheme).toBe('dark')
  })

  it('lets an explicit light preference beat the OS setting', () => {
    localStorage.setItem(APPEARANCE_KEYS.dark, 'false')
    vi.mocked(window.matchMedia).mockImplementation(
      (query: string) => ({ matches: query.includes('dark'), media: query }) as MediaQueryList,
    )
    renderBootFailure(new Error('boom'))
    expect(screen()?.dataset.scheme).toBe('light')
  })
})
