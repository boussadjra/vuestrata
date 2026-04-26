import { createPinia, setActivePinia } from 'pinia'
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test'
import { nextTick } from 'vue'

// Mock matchMedia for jsdom
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

// Helpers — dynamic import after vi.resetModules() is required to get a fresh module
async function importUseTheme() {
  return (await import('@/composables/useTheme')).useTheme
}

async function importUseShape() {
  return (await import('@/composables/useShape')).useShape
}

describe('useTheme', () => {
  beforeEach(() => {
    vi.resetModules()
    setActivePinia(createPinia())
    localStorage.clear()
    document.documentElement.className = ''
  })

  it('should default to "default" theme', async () => {
    const useTheme = await importUseTheme()
    const { currentThemeName } = useTheme()
    expect(currentThemeName.value).toBe('default')
  })

  it('should set theme', async () => {
    const useTheme = await importUseTheme()
    const { setTheme, currentThemeName } = useTheme()
    setTheme('brutalist')
    await nextTick()
    expect(currentThemeName.value).toBe('brutalist')
    expect(localStorage.getItem('vuestrata-theme')).toBe('brutalist')
  })

  it('should toggle dark mode', async () => {
    const useTheme = await importUseTheme()
    const { isDark, toggleDark } = useTheme()
    const initial = isDark.value
    toggleDark()
    expect(isDark.value).toBe(!initial)
  })

  it('should restore dark mode from storage', async () => {
    localStorage.setItem('vuestrata-dark', 'true')
    const useTheme = await importUseTheme()
    const { isDark } = useTheme()
    expect(isDark.value).toBe(true)
  })
})

describe('useShape', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    document.documentElement.className = ''
  })

  it('should persist shape settings', async () => {
    const useShape = await importUseShape()
    const { setRadius, setBorder, setShadow, radius, border, shadow } = useShape()

    setRadius('large')
    setBorder('bold')
    setShadow('elevated')
    await nextTick()

    expect(radius.value).toBe('large')
    expect(border.value).toBe('bold')
    expect(shadow.value).toBe('elevated')
    expect(localStorage.getItem('vuestrata-shape-radius')).toBe('large')
    expect(localStorage.getItem('vuestrata-shape-border')).toBe('bold')
    expect(localStorage.getItem('vuestrata-shape-shadow')).toBe('elevated')
  })

  it('should restore shape settings from storage', async () => {
    localStorage.setItem('vuestrata-shape-radius', 'small')
    localStorage.setItem('vuestrata-shape-border', 'medium')
    localStorage.setItem('vuestrata-shape-shadow', 'subtle')

    const useShape = await importUseShape()
    const { radius, border, shadow } = useShape()
    await nextTick()

    expect(radius.value).toBe('small')
    expect(border.value).toBe('medium')
    expect(shadow.value).toBe('subtle')
  })
})
