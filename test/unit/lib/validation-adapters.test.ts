import { describe, it, expect } from 'vite-plus/test'
import { z } from 'zod'

import { createValidator } from '@/lib/validation'
import type { ValidationAdapter } from '~/types'

describe('Validation Adapters', () => {
  describe('zod adapter', () => {
    let adapter: ValidationAdapter

    it('should create a zod adapter', async () => {
      adapter = await createValidator('zod')
      expect(adapter).toBeDefined()
      expect(typeof adapter.validate).toBe('function')
      expect(typeof adapter.validateField).toBe('function')
    })

    it('should validate a valid object', async () => {
      adapter = await createValidator('zod')
      const schema = z.object({
        name: z.string().min(2),
        email: z.string().email(),
      })
      const result = adapter.validate(schema, {
        name: 'John',
        email: 'john@test.com',
      })
      expect(result.success).toBe(true)
    })

    it('should return errors for invalid data', async () => {
      adapter = await createValidator('zod')
      const schema = z.object({
        name: z.string().min(2),
        email: z.string().email(),
      })
      const result = adapter.validate(schema, { name: '', email: 'invalid' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.errors.length).toBeGreaterThan(0)
        expect(result.errors.some((e) => e.path === 'name')).toBe(true)
      }
    })

    it('should validate a single field', async () => {
      adapter = await createValidator('zod')
      const schema = z.object({
        name: z.string().min(2),
      })
      expect(adapter.validateField(schema, 'name', 'Jo')).toBe(true)
      expect(adapter.validateField(schema, 'name', 'J')).not.toBe(true)
    })
  })

  describe('createValidator caching', () => {
    it('should return the same instance on repeated calls', async () => {
      const a = await createValidator('zod')
      const b = await createValidator('zod')
      expect(a).toBe(b)
    })
  })
})
