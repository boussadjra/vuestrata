import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import {
  noteStaleChunkReloadBaseline,
  pendingStaleChunkReloadMs,
} from '@/bootstrap/stale-chunk-reload'
import { clearStaleChunkMarker, handleStaleChunkError } from '@/plugins/stale-chunk'

/**
 * "Is this page about to be replaced by a stale-chunk reload?"
 *
 * The answer is read from the marker `plugins/stale-chunk.ts` leaves in
 * `sessionStorage`, without that file exporting anything for it: the plugin is
 * the project's file and the reader is Vuestrata's. So every test here drives
 * the real plugin, which is what would notice the two drifting apart.
 */

const staleChunk = new Error('Failed to fetch dynamically imported module')

/** The plugin, asked to recover, with a reload that does not leave the test. */
const askForReload = () => handleStaleChunkError(staleChunk, vi.fn())

beforeEach(() => {
  sessionStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  sessionStorage.clear()
})

describe('pendingStaleChunkReloadMs', () => {
  it('is 0 while no reload has been asked for', () => {
    noteStaleChunkReloadBaseline()
    expect(pendingStaleChunkReloadMs()).toBe(0)

    handleStaleChunkError(new Error('boom'), vi.fn())

    expect(pendingStaleChunkReloadMs()).toBe(0)
  })

  it('is the time the reload still has, once this document has asked for one', () => {
    noteStaleChunkReloadBaseline()

    expect(askForReload()).toBe(true)
    expect(pendingStaleChunkReloadMs()).toBe(10_000)

    vi.advanceTimersByTime(4000)
    expect(pendingStaleChunkReloadMs()).toBe(6000)
  })

  it('runs out, so a reload that never happens cannot hide errors for ever', () => {
    noteStaleChunkReloadBaseline()
    askForReload()

    vi.advanceTimersByTime(10_000)

    expect(pendingStaleChunkReloadMs()).toBe(0)
  })

  it('is 0 in the document the reload came back to', () => {
    // The previous document asked, and left its marker behind.
    askForReload()
    vi.advanceTimersByTime(800)

    // This one boots, and the same chunk fails again.
    noteStaleChunkReloadBaseline()
    expect(askForReload()).toBe(false)

    expect(pendingStaleChunkReloadMs()).toBe(0)
  })

  it('is 0 again once the plugin clears its marker', () => {
    noteStaleChunkReloadBaseline()
    askForReload()

    // What router.afterEach does after a navigation the visitor made succeeds.
    clearStaleChunkMarker()

    expect(pendingStaleChunkReloadMs()).toBe(0)
  })

  it('still waits when boot never recorded a baseline', () => {
    askForReload()

    expect(pendingStaleChunkReloadMs()).toBe(10_000)
  })

  it('does not wait on a marker it cannot read as a time', () => {
    noteStaleChunkReloadBaseline()
    sessionStorage.setItem('vuestrata-stale-chunk-reload', 'not a number')

    expect(pendingStaleChunkReloadMs()).toBe(0)
  })

  it('does not wait on a marker from the future', () => {
    noteStaleChunkReloadBaseline()
    sessionStorage.setItem('vuestrata-stale-chunk-reload', String(Date.now() + 60_000))

    expect(pendingStaleChunkReloadMs()).toBe(0)
  })

  it('is 0, and does not throw, when storage is unavailable', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })

    expect(() => noteStaleChunkReloadBaseline()).not.toThrow()
    expect(pendingStaleChunkReloadMs()).toBe(0)

    getItem.mockRestore()
    setItem.mockRestore()
  })
})
