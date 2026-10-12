import { createGlobalState } from '@vueuse/core'

import { applyAppearance, type SupportedLocale } from '@/plugins/appearance'
import { getI18n } from '@/plugins/i18n'
import { reportError } from '~/lib/errors'

export type LocaleCatalog = Record<string, unknown>
export type LocaleCatalogLoader = () => Promise<LocaleCatalog>

/** Coalesce downloads and preserve registration order when catalogs overlap. */
export const useLocaleCatalogs = createGlobalState(() => {
  const loaders = new Map<string, Map<string, LocaleCatalogLoader>>()
  const loaded = new Set<string>()
  const pending = new Map<string, Promise<LocaleCatalog>>()
  const requested = ref<SupportedLocale>('en')
  let requestVersion = 0
  let selectionVersion = 0

  /** Language controls share one ordering, even when they are separate components. */
  function beginSelection() {
    const version = ++selectionVersion
    return () => version === selectionVersion
  }

  function register(locale: string, owner: string, loader: LocaleCatalogLoader) {
    const sources = loaders.get(locale) ?? new Map<string, LocaleCatalogLoader>()
    if (sources.get(owner) === loader) return
    loaded.delete(`${locale}/${owner}`)
    pending.delete(`${locale}/${owner}`)
    sources.set(owner, loader)
    loaders.set(locale, sources)
  }

  function isReady(locale: string) {
    return [...(loaders.get(locale)?.keys() ?? [])].every((owner) =>
      loaded.has(`${locale}/${owner}`),
    )
  }

  async function ensure(locale: string): Promise<void> {
    const { global } = getI18n()
    const sources = [...(loaders.get(locale) ?? [])]
    const catalogs = await Promise.all(
      sources.map(([owner, loader]) => {
        const key = `${locale}/${owner}`
        if (loaded.has(key)) return Promise.resolve(null)
        let download = pending.get(key)
        if (!download) {
          download = Promise.resolve().then(loader)
          pending.set(key, download)
          void download.catch(() => {
            if (pending.get(key) === download) pending.delete(key)
          })
        }
        return download
      }),
    )
    for (let index = 0; index < sources.length; index++) {
      const key = `${locale}/${sources[index]![0]}`
      const catalog = catalogs[index]
      if (
        catalog &&
        !loaded.has(key) &&
        loaders.get(locale)?.get(sources[index]![0]) === sources[index]![1]
      ) {
        global.mergeLocaleMessage(locale, catalog)
        loaded.add(key)
        pending.delete(key)
      }
    }
  }

  function activate(locale: SupportedLocale): Promise<void> {
    const { global } = getI18n()
    requested.value = locale
    const version = ++requestVersion
    const apply = () => {
      if (version !== requestVersion) return
      global.locale.value = locale
      applyAppearance({ locale })
    }
    if (isReady(locale)) {
      apply()
      return Promise.resolve()
    }
    return ensure(locale).then(apply)
  }

  /** A failed download keeps the rendered language; the next selection retries. */
  function sync(locale: SupportedLocale) {
    void activate(locale).catch((error: unknown) => reportError(error, { source: 'locale:load' }))
  }

  return { register, ensure, activate, sync, isReady, requested, beginSelection }
})
