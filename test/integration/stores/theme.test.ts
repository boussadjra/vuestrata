import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'
import { nextTick } from 'vue'

import { registerTheme, getThemes, getTheme } from '@/config/theme.config'

let stopThemeSync: (() => void) | undefined

describe('Theme Config', () => {
  it('should return built-in themes', () => {
    const themes = getThemes()
    const names = themes.map((t) => t.name)
    expect(names).toContain('default')
    expect(names).toContain('brutalist')
    expect(names).toContain('ghibli')
  })

  it('should get a theme by name', () => {
    const theme = getTheme('brutalist')
    expect(theme).toBeDefined()
    expect(theme!.cssClass).toBe('theme-brutalist')
  })

  it('should return undefined for unknown theme', () => {
    expect(getTheme('nonexistent')).toBeUndefined()
  })

  it('should register a custom theme', () => {
    registerTheme({
      name: 'cyberpunk',
      label: 'Cyberpunk',
      cssClass: 'theme-cyberpunk',
    })
    const theme = getTheme('cyberpunk')
    expect(theme).toBeDefined()
    expect(theme!.label).toBe('Cyberpunk')
  })
})

describe('useTheme', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    document.documentElement.className = ''
  })

  afterEach(() => {
    stopThemeSync?.()
    stopThemeSync = undefined
    document.documentElement.className = ''
  })

  it('should toggle dark mode value', async () => {
    const { useTheme } = await import('@/composables/useTheme')
    const { isDark, toggleDark } = useTheme()
    const initial = isDark.value
    toggleDark()
    await nextTick()
    expect(isDark.value).toBe(!initial)
    expect(localStorage.getItem('vuestrata-dark')).toBe(String(isDark.value))
  })

  it('should set theme and sync classes when root sync is enabled', async () => {
    const { useTheme, useThemeSync } = await import('@/composables/useTheme')
    stopThemeSync = useThemeSync()
    const { setTheme, currentThemeName } = useTheme()
    setTheme('brutalist')
    expect(currentThemeName.value).toBe('brutalist')
    await nextTick()
    expect(document.documentElement.classList.contains('theme-brutalist')).toBe(true)
    expect(localStorage.getItem('vuestrata-theme')).toBe('brutalist')
  })
})

/**
 * Renaming a theme must not throw away a preference the user actually set.
 *
 * A stored theme name passes `THEME_PATTERN` whether or not a theme by that
 * name still exists, so without the alias map the old value survives
 * validation, resolves to no registered theme, and drops the user back to
 * Default with nothing to explain it. Delete this block when THEME_ALIASES is
 * emptied.
 */
describe('renamed themes', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    document.documentElement.className = ''
  })

  afterEach(() => {
    stopThemeSync?.()
    stopThemeSync = undefined
    document.documentElement.className = ''
  })

  it('translates a stored legacy name and writes the new one back', async () => {
    localStorage.setItem('vuestrata-theme', 'febin')

    const { useTheme, useThemeSync } = await import('@/composables/useTheme')
    stopThemeSync = useThemeSync()
    const { currentThemeName } = useTheme()
    await nextTick()

    expect(currentThemeName.value).toBe('harbour')
    expect(document.documentElement.classList.contains('theme-harbour')).toBe(true)
    // Written back, so the translation runs once rather than on every load.
    expect(localStorage.getItem('vuestrata-theme')).toBe('harbour')
  })

  it('leaves a name that was never renamed alone', async () => {
    localStorage.setItem('vuestrata-theme', 'ghibli')

    const { useTheme } = await import('@/composables/useTheme')
    expect(useTheme().currentThemeName.value).toBe('ghibli')
  })
})
