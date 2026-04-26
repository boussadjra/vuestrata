import { describe, it, expect } from 'vite-plus/test'

import { logger, createScopedLogger } from '@/lib/logger'

describe('Logger', () => {
  it('should export a logger instance', () => {
    expect(logger).toBeDefined()
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
  })

  it('should create a scoped logger with a tag', () => {
    const scoped = createScopedLogger('test-scope')
    expect(scoped).toBeDefined()
    expect(typeof scoped.info).toBe('function')
    expect(typeof scoped.warn).toBe('function')
    expect(typeof scoped.error).toBe('function')
  })

  it('should create distinct scoped loggers', () => {
    const a = createScopedLogger('scope-a')
    const b = createScopedLogger('scope-b')
    expect(a).not.toBe(b)
  })
})
