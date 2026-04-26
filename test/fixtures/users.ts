import type { User } from '~/types'

let counter = 0

export function createUser(overrides: Partial<User> = {}): User {
  counter++
  return {
    id: `user-${counter}`,
    email: `user${counter}@test.com`,
    name: `User ${counter}`,
    role: 'member',
    createdAt: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

/**
 * Reset the deterministic ID counter so tests that rely on a fixed sequence
 * (e.g. snapshot expectations on `user-1`, `user-2`) do not depend on the
 * order vitest happens to load suites in. Call from `beforeEach`.
 */
export function resetUserCounter(): void {
  counter = 0
}
