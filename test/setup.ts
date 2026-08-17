import { config as VTUConfig } from '@vue/test-utils'
import { beforeEach, vi } from 'vite-plus/test'

import { loadModuleTranslations } from '@/modules/i18n'
import { appModules } from '@/modules/setup'
import { getI18n } from '@/plugins/i18n'

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

class ResizeObserverMock {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn()
}

// jsdom implements no part of the Pointer Capture API. Reka's Select and
// Slider primitives call these while handling pointerdown, so without the
// stubs a component test that opens a listbox dies on
// `target.hasPointerCapture is not a function` rather than on anything real.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
}

// Reset Pinia + core/lib runtime backends + createGlobalState containers
// before every test so cross-suite leakage of mutable state cannot occur.
beforeEach(async () => {
  await resetRuntimeState()
})

// Ensure vue-i18n is available to every `mount()` in the test environment so
// components that call `useI18n()` do not need to manually install the plugin.
VTUConfig.global.plugins = VTUConfig.global.plugins || []
VTUConfig.global.plugins.push(getI18n())

// Merge module-scoped translations (e.g. `src/modules/users/i18n/en.json`) into
// the global i18n instance so components under test can `t()` module keys.
loadModuleTranslations(appModules)
