import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import {
  clearStaleChunkMarker,
  handleStaleChunkError,
  isStaleChunkError,
} from '@/plugins/stale-chunk'

/**
 * Stale-chunk recovery.
 *
 * The message patterns are the fragile part — there is no shared error type or
 * error code for a failed dynamic import, so detection is substring matching
 * per engine. Pinning them here means a browser changing its wording shows up
 * as a failing test rather than as users stuck on a dead navigation.
 */

beforeEach(() => {
  sessionStorage.clear()
})

describe('isStaleChunkError', () => {
  it.each([
    // Chromium
    'Failed to fetch dynamically imported module: https://app.example.com/assets/about-a1b2.js',
    // Firefox
    'error loading dynamically imported module',
    // Safari
    'Importing a module script failed.',
    // Vite CSS preload
    'Unable to preload CSS for /assets/about-a1b2.css',
    // SPA fallback served index.html where a .js chunk was expected
    "Unexpected token '<'",
  ])('recognises %s', (message) => {
    expect(isStaleChunkError(new Error(message))).toBe(true)
  })

  it('ignores ordinary application errors', () => {
    expect(isStaleChunkError(new Error('Cannot read properties of undefined'))).toBe(false)
    expect(isStaleChunkError(new Error('Network request failed'))).toBe(false)
    expect(isStaleChunkError(null)).toBe(false)
    expect(isStaleChunkError(undefined)).toBe(false)
  })

  it('accepts a bare string, which is what vite:preloadError can carry', () => {
    expect(isStaleChunkError('Failed to fetch dynamically imported module')).toBe(true)
  })
})

describe('handleStaleChunkError', () => {
  it('reloads once for a stale chunk', () => {
    const reload = vi.fn()

    const handled = handleStaleChunkError(
      new Error('Failed to fetch dynamically imported module'),
      reload,
    )

    expect(handled).toBe(true)
    expect(reload).toHaveBeenCalledOnce()
  })

  it('does not reload for an unrelated error', () => {
    const reload = vi.fn()

    const handled = handleStaleChunkError(new Error('boom'), reload)

    expect(handled).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('refuses a second reload — an unguarded handler is an infinite refresh loop', () => {
    const reload = vi.fn()
    const error = new Error('Failed to fetch dynamically imported module')

    handleStaleChunkError(error, reload)
    const second = handleStaleChunkError(error, reload)

    expect(second).toBe(false)
    expect(reload).toHaveBeenCalledOnce()
  })

  it('allows a fresh reload after a successful navigation cleared the marker', () => {
    const reload = vi.fn()
    const error = new Error('Failed to fetch dynamically imported module')

    handleStaleChunkError(error, reload)
    // What router.afterEach does once chunks are loading again.
    clearStaleChunkMarker()
    handleStaleChunkError(error, reload)

    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('refuses to reload when sessionStorage is unavailable', () => {
    const reload = vi.fn()
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })

    // Fails closed: with no way to record the attempt, reloading risks a loop
    // that pins the CPU and cannot be escaped.
    const handled = handleStaleChunkError(
      new Error('Failed to fetch dynamically imported module'),
      reload,
    )

    expect(handled).toBe(false)
    expect(reload).not.toHaveBeenCalled()
    getItem.mockRestore()
  })
})
