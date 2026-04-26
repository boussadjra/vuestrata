import { describe, it, expect } from 'vite-plus/test'

import { AppError, normalizeError, getStatusMessage } from '@/lib/errors'

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
