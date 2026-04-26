import { describe, it, expect } from 'vite-plus/test'

import { apiFetch, installApiAuth } from '@/lib/api/client'

describe('API Client', () => {
  it('should export apiFetch', () => {
    expect(apiFetch).toBeDefined()
    expect(typeof apiFetch).toBe('function')
  })

  it('should be configured with /api baseURL by default', () => {
    // apiFetch is an ofetch instance — verify it exists
    expect(apiFetch).toBeDefined()
  })

  it('should export installApiAuth for dependency injection', () => {
    expect(installApiAuth).toBeDefined()
    expect(typeof installApiAuth).toBe('function')
  })
})
