import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import {
  getErrorReporter,
  installErrorReporter,
  reportError,
  resetErrorReporter,
  setErrorReporterUser,
  type ErrorReporter,
} from '~/lib/errors/reporter'

/**
 * The reporter is the one place errors leave the application. Its contract is
 * that call sites never need to know whether a provider is configured, and that
 * a misbehaving provider can never make things worse than the original error.
 */

type SpyReporter = ErrorReporter & {
  captureException: ReturnType<typeof vi.fn<ErrorReporter['captureException']>>
  setUser: ReturnType<typeof vi.fn<ErrorReporter['setUser']>>
}

function createSpyReporter(name = 'spy'): SpyReporter {
  return {
    name,
    captureException: vi.fn<ErrorReporter['captureException']>(),
    setUser: vi.fn<ErrorReporter['setUser']>(),
  }
}

afterEach(() => {
  resetErrorReporter()
  vi.restoreAllMocks()
})

describe('error reporter', () => {
  it('defaults to a no-op so call sites need no guards', () => {
    expect(getErrorReporter().name).toBe('noop')
    expect(() => reportError(new Error('boom'), { source: 'test' })).not.toThrow()
  })

  it('forwards errors and context to an installed reporter', () => {
    const reporter = createSpyReporter()
    installErrorReporter(reporter)

    const error = new Error('render failed')
    reportError(error, { source: 'vue:render', component: 'UserTable', info: 'setup' })

    expect(reporter.captureException).toHaveBeenCalledWith(error, {
      source: 'vue:render',
      component: 'UserTable',
      info: 'setup',
    })
  })

  it('forwards the signed-in user and clears it on sign-out', () => {
    const reporter = createSpyReporter()
    installErrorReporter(reporter)

    setErrorReporterUser({ id: 'u1', email: 'a@b.test' })
    expect(reporter.setUser).toHaveBeenCalledWith({ id: 'u1', email: 'a@b.test' })

    setErrorReporterUser(null)
    expect(reporter.setUser).toHaveBeenLastCalledWith(null)
  })

  // A reporter that throws must not replace the error being reported — that
  // would turn a recoverable render error into an unrelated crash and lose the
  // original entirely.
  it('contains a reporter that throws while capturing', () => {
    installErrorReporter({
      name: 'broken',
      captureException: () => {
        throw new Error('reporter is down')
      },
      setUser: () => {},
    })

    expect(() => reportError(new Error('original'), { source: 'test' })).not.toThrow()
  })

  it('contains a reporter that throws while setting the user', () => {
    installErrorReporter({
      name: 'broken',
      captureException: () => {},
      setUser: () => {
        throw new Error('reporter is down')
      },
    })

    expect(() => setErrorReporterUser({ id: 'u1' })).not.toThrow()
  })

  // Two active reporters double-report every error, which corrupts error
  // volume metrics and burns quota.
  it('replaces a previously installed reporter rather than stacking them', () => {
    const first = createSpyReporter('first')
    const second = createSpyReporter('second')

    installErrorReporter(first)
    installErrorReporter(second)

    reportError(new Error('boom'), { source: 'test' })

    expect(first.captureException).not.toHaveBeenCalled()
    expect(second.captureException).toHaveBeenCalledTimes(1)
    expect(getErrorReporter().name).toBe('second')
  })

  it('resets back to the no-op reporter', () => {
    installErrorReporter(createSpyReporter())
    resetErrorReporter()
    expect(getErrorReporter().name).toBe('noop')
  })
})
