/**
 * Tests for demo-storage (envelope read/write, expiry, integrity, cross-tab events).
 * Uses fake-indexeddb so real IndexedDB APIs are available in Node.
 */
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

describe('demo-storage — round-trip', () => {
  it('writes and reads back the payload unchanged', async () => {
    const { writeEnvelope, readEnvelope } = await import('@/modules/app/state/demo-storage')
    const payload = { userId: 'u1', role: 'member' }
    await writeEnvelope('session', 'test-key', payload, 1)
    const result = await readEnvelope<typeof payload>('session', 'test-key')
    expect(result).toMatchObject(payload)
  })
})

describe('demo-storage — TTL expiry', () => {
  it('returns null for an expired envelope', async () => {
    const { writeEnvelope, readEnvelope } = await import('@/modules/app/state/demo-storage')
    const { getRecord } = await import('@/modules/app/state/demo-persistence')
    const payload = { userId: 'u2' }
    // Write with 0 hours retention (expires immediately in the past)
    // We manually fake the expiresAt by writing a valid envelope then
    // modifying time. Simplest: write with 1h, then advance Date.now.
    await writeEnvelope('session', 'expired-key', payload, 1)

    // Advance time past expiry
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2 * 60 * 60 * 1000)

    const result = await readEnvelope<typeof payload>('session', 'expired-key')
    expect(result).toBeNull()
    await expect(getRecord('session', 'expired-key')).resolves.toBeNull()
  })
})

describe('demo-storage — integrity', () => {
  it('returns null when the stored record is tampered', async () => {
    const { writeEnvelope, readEnvelope } = await import('@/modules/app/state/demo-storage')
    const { getRecord, putRecord } = await import('@/modules/app/state/demo-persistence')

    const payload = { secret: 'data' }
    await writeEnvelope('session', 'tamper-key', payload, 1)

    // Overwrite with tampered envelope (wrong integrityHash)
    const tampered = {
      version: 1,
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000,
      integrityHash: 'bad',
      payload,
    }
    await putRecord('session', 'tamper-key', tampered)

    const result = await readEnvelope<typeof payload>('session', 'tamper-key')
    expect(result).toBeNull()
    await expect(getRecord('session', 'tamper-key')).resolves.toBeNull()
  })

  it('returns null and deletes when envelope version does not match', async () => {
    const { readEnvelope } = await import('@/modules/app/state/demo-storage')
    const { getRecord, putRecord } = await import('@/modules/app/state/demo-persistence')
    const payload = { versioned: true }

    await putRecord('session', 'version-key', {
      version: 2,
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000,
      integrityHash: 'irrelevant',
      payload,
    })

    await expect(readEnvelope<typeof payload>('session', 'version-key')).resolves.toBeNull()
    await expect(getRecord('session', 'version-key')).resolves.toBeNull()
  })

  it('returns null and deletes malformed envelope records', async () => {
    const { readEnvelope } = await import('@/modules/app/state/demo-storage')
    const { getRecord, putRecord } = await import('@/modules/app/state/demo-persistence')

    await putRecord('session', 'malformed-key', { payload: { id: 'u1' } })

    await expect(readEnvelope('session', 'malformed-key')).resolves.toBeNull()
    await expect(getRecord('session', 'malformed-key')).resolves.toBeNull()
  })
})

describe('demo-storage — missing record', () => {
  it('returns null when the key does not exist', async () => {
    const { readEnvelope } = await import('@/modules/app/state/demo-storage')
    const result = await readEnvelope('session', 'nonexistent')
    expect(result).toBeNull()
  })
})

describe('demo-storage — in-memory fallback', () => {
  it('falls back to in-memory when indexedDB is undefined', async () => {
    const origIndexedDB = (globalThis as Record<string, unknown>).indexedDB
    ;(globalThis as Record<string, unknown>).indexedDB = undefined
    resetDemoGlobals()

    const { writeEnvelope, readEnvelope } = await import('@/modules/app/state/demo-storage')
    const payload = { mode: 'fallback' }
    await writeEnvelope('session', 'fb-key', payload, 1)
    const result = await readEnvelope<typeof payload>('session', 'fb-key')
    expect(result).toMatchObject(payload)

    ;(globalThis as Record<string, unknown>).indexedDB = origIndexedDB
  })
})

describe('demo-storage — invalidation channel', () => {
  it('broadcastInvalidation notifies registered listeners and supports unsubscribe', async () => {
    const listeners = new Set<(event: MessageEvent<string>) => void>()
    const originalBroadcastChannel = globalThis.BroadcastChannel
    class MockBroadcastChannel {
      name: string

      constructor(name: string) {
        this.name = name
      }

      postMessage(message: string) {
        for (const listener of listeners) {
          listener({ data: message } as MessageEvent<string>)
        }
      }

      addEventListener(_type: string, listener: (event: MessageEvent<string>) => void) {
        listeners.add(listener)
      }

      removeEventListener(_type: string, listener: (event: MessageEvent<string>) => void) {
        listeners.delete(listener)
      }
    }

    Object.defineProperty(globalThis, 'BroadcastChannel', {
      configurable: true,
      value: MockBroadcastChannel,
    })
    resetDemoGlobals()

    try {
      const { broadcastInvalidation, onInvalidation } =
        await import('@/modules/app/state/demo-storage')
      const callback = vi.fn()
      const unsubscribe = onInvalidation(callback)

      broadcastInvalidation('update')
      expect(callback).toHaveBeenCalledWith('update')

      unsubscribe()
      broadcastInvalidation('clear')
      expect(callback).toHaveBeenCalledTimes(1)
    } finally {
      Object.defineProperty(globalThis, 'BroadcastChannel', {
        configurable: true,
        value: originalBroadcastChannel,
      })
      resetDemoGlobals()
    }
  })

  it('onInvalidation is a no-op when BroadcastChannel is unavailable', async () => {
    const originalBroadcastChannel = globalThis.BroadcastChannel
    Object.defineProperty(globalThis, 'BroadcastChannel', {
      configurable: true,
      value: undefined,
    })
    resetDemoGlobals()

    try {
      const { broadcastInvalidation, onInvalidation } =
        await import('@/modules/app/state/demo-storage')
      const callback = vi.fn()
      const unsubscribe = onInvalidation(callback)

      broadcastInvalidation('update')
      unsubscribe()

      expect(callback).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(globalThis, 'BroadcastChannel', {
        configurable: true,
        value: originalBroadcastChannel,
      })
      resetDemoGlobals()
    }
  })

  it('notifies listeners from storage events when BroadcastChannel is unavailable', async () => {
    const originalBroadcastChannel = globalThis.BroadcastChannel
    Object.defineProperty(globalThis, 'BroadcastChannel', {
      configurable: true,
      value: undefined,
    })
    resetDemoGlobals()

    try {
      const { onInvalidation } = await import('@/modules/app/state/demo-storage')
      const callback = vi.fn()
      const unsubscribe = onInvalidation(callback)

      globalThis.dispatchEvent(
        new StorageEvent('storage', {
          key: 'vuestrata-demo-auth-invalidation',
          newValue: JSON.stringify({ event: 'clear', emittedAt: Date.now(), nonce: 'test' }),
        }),
      )

      expect(callback).toHaveBeenCalledWith('clear')

      unsubscribe()
      globalThis.dispatchEvent(
        new StorageEvent('storage', {
          key: 'vuestrata-demo-auth-invalidation',
          newValue: JSON.stringify({ event: 'update', emittedAt: Date.now(), nonce: 'test-2' }),
        }),
      )

      expect(callback).toHaveBeenCalledTimes(1)
    } finally {
      Object.defineProperty(globalThis, 'BroadcastChannel', {
        configurable: true,
        value: originalBroadcastChannel,
      })
      resetDemoGlobals()
    }
  })
})
