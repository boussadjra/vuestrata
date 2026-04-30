import { beforeEach, vi } from 'vite-plus/test'

import { resetRuntimeState } from './utils/reset-runtime-state'

// Global matchMedia mock for jsdom environment
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Reset Pinia + core/lib runtime backends + createGlobalState containers
// before every test so cross-suite leakage of mutable state cannot occur.
beforeEach(async () => {
  await resetRuntimeState()
})
