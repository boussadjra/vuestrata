import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import type { LocaleCatalog } from '@/state/locale-catalogs'

function deferred() {
  let resolve!: (catalog: LocaleCatalog) => void
  let reject!: (error: Error) => void
  const promise = new Promise<LocaleCatalog>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

async function coldStart() {
  vi.resetModules()
  const { getI18n } = await import('@/plugins/i18n')
  const { useLocaleCatalogs } = await import('@/state/locale-catalogs')
  return { catalogs: useLocaleCatalogs(), i18n: getI18n().global }
}

afterEach(() => {
  vi.doUnmock('@/locales/fr.overrides.json')
  vi.resetModules()
})

describe('locale catalog downloads', () => {
  it('keeps the dashboard and account fallbacks English-only until a language is selected', async () => {
    const { catalogs, i18n } = await coldStart()
    const { ensureDashboardMessages } =
      await import('@/modules/analytics/composables/useDashboardI18n')
    const { ensureAccountMessages } = await import('@/modules/auth/ensure-account-i18n')
    ensureDashboardMessages()
    ensureAccountMessages()
    expect(i18n.availableLocales).toEqual(['en'])
    const { loadModuleTranslations } = await import('@/modules/i18n')
    const { appModules } = await import('@/modules/setup')
    await loadModuleTranslations(appModules)
    await catalogs.activate('fr')
    expect(i18n.t('dash_revenue_split_title')).toBe('Revenus par source')
    expect(i18n.availableLocales).toEqual(['en', 'fr'])
  })

  it('starts with English and applies lazy shell overrides deeply', async () => {
    vi.doMock('@/locales/fr.overrides.json', () => ({
      default: { validation: { email: 'Courriel incorrect' } },
    }))
    const { catalogs, i18n } = await coldStart()
    expect(i18n.availableLocales).toEqual(['en'])
    await catalogs.activate('fr')
    expect(i18n.locale.value).toBe('fr')
    expect(i18n.t('validation.email')).toBe('Courriel incorrect')
    expect(i18n.te('validation.required')).toBe(true)
    expect(document.documentElement.lang).toBe('fr')
  })

  it('coalesces concurrent downloads and merges in module order', async () => {
    const { catalogs, i18n } = await coldStart()
    const first = deferred()
    const second = deferred()
    const loadFirst = vi.fn(() => first.promise)
    const loadSecond = vi.fn(() => second.promise)
    catalogs.register('fr', 'first', loadFirst)
    catalogs.register('fr', 'second', loadSecond)
    const one = catalogs.ensure('fr')
    const two = catalogs.ensure('fr')
    second.resolve({ overlap: 'second' })
    first.resolve({ overlap: 'first' })
    await Promise.all([one, two])
    expect(loadFirst).toHaveBeenCalledOnce()
    expect(loadSecond).toHaveBeenCalledOnce()
    expect((i18n.getLocaleMessage('fr') as Record<string, unknown>).overlap).toBe('second')
    await catalogs.ensure('fr')
    expect(loadFirst).toHaveBeenCalledOnce()
  })

  it('keeps the current language on failure and retries the failed download', async () => {
    const { catalogs, i18n } = await coldStart()
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ recovered: 'Oui' })
    catalogs.register('fr', 'network', loader)
    await expect(catalogs.activate('fr')).rejects.toThrow('offline')
    expect(i18n.locale.value).toBe('en')
    await catalogs.activate('fr')
    expect(loader).toHaveBeenCalledTimes(2)
    expect(i18n.t('recovered')).toBe('Oui')
  })

  it('does not let a slower selection overwrite a newer language', async () => {
    const { catalogs, i18n } = await coldStart()
    const slow = deferred()
    catalogs.register('fr', 'slow', () => slow.promise)
    const french = catalogs.activate('fr')
    await catalogs.activate('en')
    slow.resolve({ slow: 'chargé' })
    await french
    expect(i18n.locale.value).toBe('en')
    expect(document.documentElement.dir).toBe('ltr')
  })

  it('does not let an obsolete failed loader evict its replacement download', async () => {
    const { catalogs } = await coldStart()
    const old = deferred()
    const next = deferred()
    catalogs.register('fr', 'replaceable', () => old.promise)
    const first = catalogs.ensure('fr')
    await Promise.resolve()
    const loader = vi.fn(() => next.promise)
    catalogs.register('fr', 'replaceable', loader)
    const second = catalogs.ensure('fr')
    old.reject(new Error('obsolete'))
    await expect(first).rejects.toThrow('obsolete')
    const third = catalogs.ensure('fr')
    next.resolve({ replacement: 'Oui' })
    await Promise.all([second, third])
    expect(loader).toHaveBeenCalledOnce()
  })

  it('waits for the persisted language and discovered module catalogs before boot finishes', async () => {
    const { catalogs, i18n } = await coldStart()
    await catalogs.activate('ar')
    const { loadModuleTranslations } = await import('@/modules/i18n')
    const { appModules } = await import('@/modules/setup')
    await loadModuleTranslations(appModules)
    expect(i18n.locale.value).toBe('ar')
    expect(i18n.te('customers_create', 'ar')).toBe(true)
    expect(i18n.te('customers_create', 'fr')).toBe(false)
    expect(document.documentElement.dir).toBe('rtl')
    await catalogs.activate('fr')
    expect(i18n.te('customers_create', 'fr')).toBe(true)
  })

  it('keeps eager project catalogs and their precedence over the shell', async () => {
    const { catalogs, i18n } = await coldStart()
    await catalogs.activate('fr')
    const { loadModuleTranslations } = await import('@/modules/i18n')
    await loadModuleTranslations([
      {
        config: {
          id: 'project',
          name: 'Project',
          description: 'Custom',
          version: '1.0.0',
          category: 'system',
        },
        i18n: { en: { common_save: 'Store' }, fr: { common_save: 'Conserver' } },
      },
    ])
    expect(i18n.t('common_save')).toBe('Conserver')
  })

  it('persists a selection only after loading, and allows another attempt after failure', async () => {
    const { catalogs } = await coldStart()
    setActivePinia(createPinia())
    const { useLocales } = await import('@/composables/useLocales')
    const { useAppStore } = await import('@/stores/app')
    const { useNotificationStore } = await import('@/stores/notification')
    const store = useAppStore()
    store.setLocale('en')
    const slow = deferred()
    catalogs.register('fr', 'selection', () => slow.promise)
    const { current } = useLocales()
    current.value = 'fr'
    expect(store.locale).toBe('en')
    slow.reject(new Error('offline'))
    await vi.waitFor(() => expect(catalogs.isReady('fr')).toBe(false))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(store.locale).toBe('en')
    expect(useNotificationStore().notifications).toEqual([
      expect.objectContaining({
        type: 'error',
        message: 'Network error. Check your connection and try again.',
      }),
    ])
    catalogs.register('fr', 'selection', async () => ({ ready: 'Oui' }))
    current.value = 'fr'
    await vi.waitFor(() => expect(store.locale).toBe('fr'))
  })

  it('keeps the latest choice when two language controls have overlapping downloads', async () => {
    const { catalogs } = await coldStart()
    setActivePinia(createPinia())
    const { useLocales } = await import('@/composables/useLocales')
    const { useAppStore } = await import('@/stores/app')
    const store = useAppStore()
    store.setLocale('en')
    const slow = deferred()
    catalogs.register('fr', 'selection', () => slow.promise)
    const header = useLocales()
    const settings = useLocales()
    header.current.value = 'fr'
    settings.current.value = 'ar'
    await vi.waitFor(() => expect(store.locale).toBe('ar'))
    slow.resolve({ ready: 'Oui' })
    await catalogs.ensure('fr')
    await Promise.resolve()
    expect(store.locale).toBe('ar')
  })
})
