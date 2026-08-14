import { describe, expect, it, beforeEach } from 'vite-plus/test'

import { applyShape, readPersistedShape, normalizeRadius } from '@/plugins/shape'
import { bootstrapTheme } from '@/plugins/bootstrap-theme'

describe('shape plugin', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
  })

  it('maps the retired full radius to large', () => {
    expect(normalizeRadius('full')).toBe('large')
    expect(normalizeRadius('none')).toBe('none')
    expect(normalizeRadius('not-a-radius')).toBe('medium')
  })

  it('reads persisted shape from localStorage', () => {
    localStorage.setItem('vuestrata-shape-radius', 'none')
    localStorage.setItem('vuestrata-shape-border', 'bold')
    localStorage.setItem('vuestrata-shape-shadow', 'none')

    expect(readPersistedShape()).toEqual({
      radius: 'none',
      border: 'bold',
      shadow: 'none',
    })
  })

  it('applies non-default shape classes to html', () => {
    applyShape({ radius: 'none', border: 'bold', shadow: 'elevated' })

    expect(document.documentElement.classList.contains('shape-radius-none')).toBe(true)
    expect(document.documentElement.classList.contains('shape-border-bold')).toBe(true)
    expect(document.documentElement.classList.contains('shape-shadow-elevated')).toBe(true)
  })

  it('does not add classes for CSS defaults', () => {
    applyShape({ radius: 'medium', border: 'thin', shadow: 'medium' })

    expect(Array.from(document.documentElement.classList).some((c) => c.startsWith('shape-'))).toBe(
      false,
    )
  })

  it('bootstraps a persisted sharp radius before Vue mounts', () => {
    localStorage.setItem('vuestrata-shape-radius', 'none')
    bootstrapTheme()
    expect(document.documentElement.classList.contains('shape-radius-none')).toBe(true)
  })
})
