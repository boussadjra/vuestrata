import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'

import {
  applyAppearance,
  isDocsPath,
  readPersistedAppearance,
  resolveActiveLocale,
} from '@/plugins/appearance'
import { bootstrapTheme } from '@/plugins/bootstrap-theme'

const originalPath = window.location.pathname

describe('isDocsPath', () => {
  it('matches the docs index and nested pages', () => {
    expect(isDocsPath('/docs')).toBe(true)
    expect(isDocsPath('/docs/')).toBe(true)
    expect(isDocsPath('/docs/theming/overview')).toBe(true)
    expect(isDocsPath('/docs/theming/overview?x=1')).toBe(true)
  })

  it('does not match similarly prefixed app routes', () => {
    expect(isDocsPath('/')).toBe(false)
    expect(isDocsPath('/dashboard')).toBe(false)
    expect(isDocsPath('/documentation')).toBe(false)
    expect(isDocsPath('/docsfoo')).toBe(false)
  })
})

describe('resolveActiveLocale', () => {
  it('locks English on documentation paths', () => {
    expect(resolveActiveLocale('/docs', 'ar')).toBe('en')
    expect(resolveActiveLocale('/docs/recipes/add-a-locale', 'fr')).toBe('en')
  })

  it('keeps the persisted locale everywhere else', () => {
    expect(resolveActiveLocale('/dashboard', 'ar')).toBe('ar')
    expect(resolveActiveLocale('/', 'fr')).toBe('fr')
  })
})

describe('bootstrapTheme locale', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
    document.documentElement.lang = ''
    document.documentElement.removeAttribute('dir')
  })

  afterEach(() => {
    window.history.replaceState(null, '', originalPath || '/')
    document.documentElement.lang = ''
    document.documentElement.removeAttribute('dir')
    document.documentElement.className = ''
  })

  it('applies a persisted Arabic locale outside docs', () => {
    localStorage.setItem('vuestrata-locale', 'ar')
    window.history.replaceState(null, '', '/dashboard')

    bootstrapTheme()

    expect(document.documentElement.lang).toBe('ar')
    expect(document.documentElement.dir).toBe('rtl')
    expect(readPersistedAppearance().locale).toBe('ar')
  })

  it('forces English LTR on /docs without writing the stored locale', () => {
    localStorage.setItem('vuestrata-locale', 'ar')
    window.history.replaceState(null, '', '/docs/getting-started/installation')

    bootstrapTheme()

    expect(document.documentElement.lang).toBe('en')
    expect(document.documentElement.dir).toBe('ltr')
    expect(localStorage.getItem('vuestrata-locale')).toBe('ar')
    expect(readPersistedAppearance().locale).toBe('ar')
  })
})

describe('applyAppearance locale', () => {
  afterEach(() => {
    document.documentElement.lang = ''
    document.documentElement.removeAttribute('dir')
  })

  it('sets lang and dir from the locale', () => {
    applyAppearance({ locale: 'ar' })
    expect(document.documentElement.lang).toBe('ar')
    expect(document.documentElement.dir).toBe('rtl')

    applyAppearance({ locale: 'en' })
    expect(document.documentElement.lang).toBe('en')
    expect(document.documentElement.dir).toBe('ltr')
  })
})
