import { createFetchError } from 'ofetch'
import { afterEach, describe, it, expect, vi } from 'vite-plus/test'

import {
  AppError,
  installErrorHandlers,
  installErrorReporter,
  isNotFoundError,
  normalizeError,
  getStatusMessage,
  reportError,
  resetErrorReporter,
  transportError,
} from '@/lib/errors'

/** A request that never got a response, the way ofetch reports it. */
function noResponse(cause: unknown) {
  return createFetchError({
    request: 'https://api.test/customers?search=jane.doe%40example.test',
    options: { method: 'GET', headers: new Headers() },
    error: cause as Error,
  })
}

/** A request the server answered with an error status, the way ofetch reports it. */
function answered(status: number, body?: unknown) {
  const response = Object.assign(new Response(null, { status }), { _data: body })
  return createFetchError({
    request: 'https://api.test/customers?search=jane.doe%40example.test',
    options: { method: 'GET', headers: new Headers() },
    response,
  })
}

function timeoutReason() {
  const reason = new Error('The operation was aborted due to timeout')
  reason.name = 'TimeoutError'
  return reason
}

describe('AppError', () => {
  it('should create with default values', () => {
    const err = new AppError({ message: 'Test error' })
    expect(err.message).toBe('Test error')
    expect(err.name).toBe('AppError')
    expect(err.code).toBe('UNKNOWN_ERROR')
    expect(err.status).toBe(500)
    expect(err.details).toBeUndefined()
    expect(err.requestId).toBeUndefined()
  })

  it('should create with all options', () => {
    const err = new AppError({
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      status: 422,
      details: { email: ['Invalid email'] },
      requestId: 'req-123',
    })
    expect(err.code).toBe('VALIDATION_ERROR')
    expect(err.status).toBe(422)
    expect(err.details).toEqual({ email: ['Invalid email'] })
    expect(err.requestId).toBe('req-123')
  })

  it('should extend Error', () => {
    const err = new AppError({ message: 'test' })
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(AppError)
  })

  it('should convert to ApiError', () => {
    const err = new AppError({
      message: 'Not found',
      code: 'NOT_FOUND',
      status: 404,
      requestId: 'req-456',
    })
    const apiErr = err.toApiError()
    expect(apiErr).toEqual({
      status: 404,
      code: 'NOT_FOUND',
      message: 'Not found',
      details: undefined,
      requestId: 'req-456',
    })
  })

  // Optional, so every existing `new AppError({ … })` keeps its meaning: an
  // error nothing classified claims no kind and no retry semantics.
  it('leaves the classification fields unset by default', () => {
    const err = new AppError({ message: 'x' })
    expect(err.kind).toBeUndefined()
    expect(err.retryable).toBeUndefined()
    expect(err.retryAfterMs).toBeUndefined()
    expect(err.messageKey).toBeUndefined()
    expect(err.formErrors).toBeUndefined()
  })

  it('carries the classification fields it is given', () => {
    const err = new AppError({
      message: 'Slow down',
      status: 429,
      kind: 'http',
      retryable: true,
      retryAfterMs: 2_000,
      messageKey: 'errors.status_429',
      formErrors: ['Try again in a moment'],
    })
    expect(err).toMatchObject({
      kind: 'http',
      retryable: true,
      retryAfterMs: 2_000,
      messageKey: 'errors.status_429',
      formErrors: ['Try again in a moment'],
    })
  })
})

describe('transportError', () => {
  it.each([
    ['network', 'NETWORK_ERROR', true],
    ['timeout', 'TIMEOUT', true],
    ['aborted', 'ABORTED', false],
  ] as const)('builds the %s error', (kind, code, retryable) => {
    expect(transportError(kind)).toMatchObject({
      kind,
      code,
      retryable,
      // No HTTP status: 500 would make an offline laptop look like an outage.
      status: 0,
      messageKey: `errors.${kind}`,
    })
  })
})

describe('normalizeError', () => {
  it('should pass through AppError unchanged', () => {
    const original = new AppError({ message: 'test', code: 'TEST' })
    expect(normalizeError(original)).toBe(original)
  })

  it('should normalize a plain Error', () => {
    const err = new Error('Something went wrong')
    const normalized = normalizeError(err)
    expect(normalized).toBeInstanceOf(AppError)
    expect(normalized.message).toBe('Something went wrong')
    expect(normalized.code).toBe('RUNTIME_ERROR')
  })

  it('should normalize ofetch-style errors with data', () => {
    const fetchErr = Object.assign(new Error('fetch failed'), {
      statusCode: 422,
      data: {
        message: 'Validation error',
        code: 'VALIDATION',
        details: { name: ['Required'] },
        requestId: 'abc',
      },
    })
    const normalized = normalizeError(fetchErr)
    expect(normalized.message).toBe('Validation error')
    expect(normalized.code).toBe('VALIDATION')
    expect(normalized.status).toBe(422)
    expect(normalized.details).toEqual({ name: ['Required'] })
    expect(normalized.requestId).toBe('abc')
  })

  it('should normalize a string', () => {
    const normalized = normalizeError('Oops')
    expect(normalized).toBeInstanceOf(AppError)
    expect(normalized.message).toBe('Oops')
    expect(normalized.code).toBe('STRING_ERROR')
  })

  it('should normalize unknown values', () => {
    const normalized = normalizeError(42)
    expect(normalized).toBeInstanceOf(AppError)
    expect(normalized.message).toBe('An unexpected error occurred')
    expect(normalized.code).toBe('UNKNOWN_ERROR')
  })

  it('should normalize null/undefined', () => {
    expect(normalizeError(null).code).toBe('UNKNOWN_ERROR')
    expect(normalizeError(undefined).code).toBe('UNKNOWN_ERROR')
  })

  it('marks what it cannot classify as unknown, and not retryable', () => {
    for (const err of [new Error('bug'), 'oops', 42]) {
      const normalized = normalizeError(err)
      expect(normalized.kind).toBe('unknown')
      expect(normalized.retryable).toBeUndefined()
      expect(normalized.messageKey).toBe('errors.unknown')
    }
  })
})

describe('normalizeError on a request without a response', () => {
  // ofetch's own message is `[GET] "https://…/customers?search=…": <no
  // response> Failed to fetch`: the endpoint and the user's search. It used to
  // reach the user verbatim, as a RUNTIME_ERROR with status 500.
  it('classifies a failed fetch as a network error, without the URL', () => {
    const err = noResponse(new TypeError('Failed to fetch'))
    expect(err.message).toContain('jane.doe')

    const normalized = normalizeError(err)

    expect(normalized).toMatchObject({
      code: 'NETWORK_ERROR',
      kind: 'network',
      retryable: true,
      status: 0,
    })
    expect(normalized.message).not.toMatch(/api\.test|customers|jane/)
  })

  it('classifies a timeout', () => {
    expect(normalizeError(noResponse(timeoutReason()))).toMatchObject({
      code: 'TIMEOUT',
      kind: 'timeout',
      retryable: true,
    })
  })

  it('classifies an abort, which is not retryable', () => {
    expect(
      normalizeError(noResponse(new DOMException('The operation was aborted.', 'AbortError'))),
    ).toMatchObject({ code: 'ABORTED', kind: 'aborted', retryable: false })
  })

  it('classifies what native fetch rejects with directly', () => {
    expect(normalizeError(new DOMException('aborted', 'AbortError')).kind).toBe('aborted')
    expect(normalizeError(new DOMException('signal timed out', 'TimeoutError')).kind).toBe(
      'timeout',
    )
  })
})

describe('normalizeError on a request the server answered', () => {
  it('classifies an HTTP error, whatever its body', () => {
    const normalized = normalizeError(answered(404, '<html>Not Found</html>'))

    expect(normalized).toMatchObject({
      status: 404,
      code: 'API_ERROR',
      kind: 'http',
      retryable: false,
      messageKey: 'errors.status_404',
      message: getStatusMessage(404),
    })
    expect(normalized.message).not.toMatch(/api\.test|jane/)
  })

  it('keeps the message and details of a client error', () => {
    const normalized = normalizeError(
      answered(422, {
        message: 'The email is already taken.',
        code: 'VALIDATION_FAILED',
        details: { email: ['Already taken'] },
      }),
    )

    expect(normalized).toMatchObject({
      status: 422,
      code: 'VALIDATION_FAILED',
      message: 'The email is already taken.',
      details: { email: ['Already taken'] },
      kind: 'http',
      retryable: false,
    })
  })

  it('never forwards the message of a server error', () => {
    const normalized = normalizeError(
      answered(500, { message: 'relation "users" does not exist at pg.internal:5432' }),
    )

    expect(normalized.message).toBe('An unexpected error occurred. Please try again.')
    expect(normalized).toMatchObject({ kind: 'http', retryable: true })
  })

  it.each([
    [408, true],
    [425, true],
    [429, true],
    [502, true],
    [503, true],
    [504, true],
    [501, false],
    [505, false],
    [400, false],
    [403, false],
    [409, false],
  ])('marks a %i retryable: %s', (status, retryable) => {
    expect(normalizeError(answered(status)).retryable).toBe(retryable)
  })

  it('keys a status it has no message for by its class', () => {
    expect(normalizeError(answered(418)).messageKey).toBe('errors.request')
    expect(normalizeError(answered(507)).messageKey).toBe('errors.server')
  })
})

describe('deliberate aborts are never reported', () => {
  afterEach(() => resetErrorReporter())

  function spyReporter() {
    const captureException = vi.fn()
    installErrorReporter({ name: 'spy', captureException, setUser: () => {} })
    return captureException
  }

  it('drops them in reportError, the choke point every sink goes through', () => {
    const captureException = spyReporter()

    reportError(transportError('aborted'), { source: 'vue:render' })
    reportError(new DOMException('aborted', 'AbortError'), { source: 'vue:render' })
    expect(captureException).not.toHaveBeenCalled()

    reportError(transportError('network'), { source: 'vue:render' })
    expect(captureException).toHaveBeenCalledOnce()
  })

  it('ignores an unhandled rejection that is an abort', () => {
    const captureException = spyReporter()
    const target = new EventTarget()
    installErrorHandlers(target)

    const rejection = (reason: unknown) =>
      Object.assign(new Event('unhandledrejection', { cancelable: true }), { reason })

    target.dispatchEvent(rejection(noResponse(new DOMException('aborted', 'AbortError'))))
    expect(captureException).not.toHaveBeenCalled()

    target.dispatchEvent(rejection(new Error('a real bug')))
    expect(captureException).toHaveBeenCalledOnce()
  })
})

describe('isNotFoundError', () => {
  it('recognises a 404 AppError', () => {
    expect(isNotFoundError(new AppError({ message: 'Gone', status: 404 }))).toBe(true)
  })

  it('recognises an ofetch error reporting the code as statusCode', () => {
    const err = Object.assign(new Error('Not Found'), { statusCode: 404 })
    expect(isNotFoundError(err)).toBe(true)
  })

  it('recognises an ofetch error reporting the code as status', () => {
    const err = Object.assign(new Error('Not Found'), { status: 404 })
    expect(isNotFoundError(err)).toBe(true)
  })

  it('is false for other failures', () => {
    expect(isNotFoundError(new AppError({ message: 'Boom', status: 500 }))).toBe(false)
    expect(isNotFoundError(new Error('network'))).toBe(false)
  })

  // The record pages call this with `query.error.value`, which is null while
  // the request is in flight and after it succeeds. No error is not a 404.
  it('is false when there is no error', () => {
    expect(isNotFoundError(null)).toBe(false)
    expect(isNotFoundError(undefined)).toBe(false)
  })
})

describe('getStatusMessage', () => {
  it('should return known status messages', () => {
    expect(getStatusMessage(400)).toContain('invalid')
    expect(getStatusMessage(401)).toContain('sign in')
    expect(getStatusMessage(403)).toContain('permission')
    expect(getStatusMessage(404)).toContain('not found')
    expect(getStatusMessage(429)).toContain('many requests')
    expect(getStatusMessage(500)).toContain('internal server error')
  })

  it('should return generic message for unknown status', () => {
    const msg = getStatusMessage(418)
    expect(msg).toContain('418')
  })
})
