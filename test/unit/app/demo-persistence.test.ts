import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { resetDemoData, resetDemoGlobals } from '../../utils/auth-test-helpers'

beforeEach(async () => {
  await resetDemoData()
})

afterEach(() => {
  resetDemoGlobals()
  vi.restoreAllMocks()
})

describe('demo-persistence — IndexedDB schema', () => {
  it('opens the demo database with users and session stores', async () => {
    const { openDemoDB } = await import('@/state/demo-persistence')

    const db = await openDemoDB()

    expect(db.objectStoreNames.contains('users')).toBe(true)
    expect(db.objectStoreNames.contains('session')).toBe(true)
  })
})

describe('demo-persistence — record operations', () => {
  it('round-trips a record through the users store', async () => {
    const { getRecord, putRecord } = await import('@/state/demo-persistence')
    const payload = { id: 'u-1', email: 'u1@example.test' }

    await putRecord('users', 'list', payload)

    await expect(getRecord<typeof payload>('users', 'list')).resolves.toEqual(payload)
  })

  it('round-trips a record through the session store', async () => {
    const { getRecord, putRecord } = await import('@/state/demo-persistence')
    const payload = { token: 'access-token' }

    await putRecord('session', 'current', payload)

    await expect(getRecord<typeof payload>('session', 'current')).resolves.toEqual(payload)
  })

  it('returns null for a missing record', async () => {
    const { getRecord } = await import('@/state/demo-persistence')

    await expect(getRecord('users', 'missing')).resolves.toBeNull()
  })

  it('deletes records idempotently', async () => {
    const { deleteRecord, getRecord, putRecord } = await import('@/state/demo-persistence')

    await putRecord('session', 'current', { token: 't' })
    await deleteRecord('session', 'current')
    await deleteRecord('session', 'current')

    await expect(getRecord('session', 'current')).resolves.toBeNull()
  })

  it('clears only the targeted store', async () => {
    const { clearStore, getRecord, putRecord } = await import('@/state/demo-persistence')

    await putRecord('users', 'list', [{ id: 'u-1' }])
    await putRecord('session', 'current', { token: 't' })
    await clearStore('users')

    await expect(getRecord('users', 'list')).resolves.toBeNull()
    await expect(getRecord('session', 'current')).resolves.toEqual({ token: 't' })
  })
})

describe('demo-persistence — in-memory fallback', () => {
  it('uses memory stores when indexedDB is unavailable', async () => {
    const originalIndexedDb = globalThis.indexedDB
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: undefined,
    })
    resetDemoGlobals()

    try {
      const { clearStore, deleteRecord, getRecord, openDemoDB, putRecord } =
        await import('@/state/demo-persistence')

      await expect(openDemoDB()).resolves.toBeTruthy()
      await putRecord('users', 'list', [{ id: 'fallback' }])
      await expect(getRecord('users', 'list')).resolves.toEqual([{ id: 'fallback' }])

      await deleteRecord('users', 'list')
      await expect(getRecord('users', 'list')).resolves.toBeNull()

      await putRecord('users', 'list', [{ id: 'fallback-2' }])
      await clearStore('users')
      await expect(getRecord('users', 'list')).resolves.toBeNull()
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', {
        configurable: true,
        value: originalIndexedDb,
      })
      resetDemoGlobals()
    }
  })
})
