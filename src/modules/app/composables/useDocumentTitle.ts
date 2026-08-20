import { useI18n } from 'vue-i18n'

import { appConfig } from '~/config/app.config'

/**
 * Keeps `document.title` in step with the active route.
 *
 * Nothing did this before: `index.html` set `<title>Vuestrata</title>` and no
 * code ever changed it, so every route in the app shared one title. That is
 * visible in three places users actually rely on — the browser tab, the
 * history menu, and a bookmark's default name — and it also weakened the
 * accessibility work already here: `useRouteAnnouncer` falls back to
 * `document.title` when a route declares no `meta.title`, and a constant title
 * makes that fallback announce the same string on every navigation.
 *
 * `meta.title` is an i18n KEY, matching `useBreadcrumbs` and
 * `useRouteAnnouncer`. The title re-renders on locale change because `t` is
 * reactive and the whole thing runs inside a `watchEffect`.
 *
 * Also maintains `<meta name="description">` where a route supplies
 * `meta.description`. There is no SSR here, so this does nothing for crawlers
 * that do not execute JavaScript — it is for the ones that do, and for link
 * unfurlers that run a headless browser.
 */
export function useDocumentTitle() {
  const route = useRoute()
  // Kept as one object rather than destructured: `te` is a method and pulling
  // it off the instance detaches it from its `this` (oxlint's unbound-method).
  const i18n = useI18n()

  function translateIfPresent(key: string): string | null {
    // `te` first: vue-i18n returns the KEY itself for a missing message, so
    // translating blindly puts a raw `nav_customers` in the browser tab.
    return i18n.te(key) ? i18n.t(key) : null
  }

  function resolveTitle(): string {
    const titleKey = route.meta.title
    if (typeof titleKey !== 'string') return appConfig.title

    const translated = translateIfPresent(titleKey)
    return translated ? `${translated} · ${appConfig.title}` : appConfig.title
  }

  watchEffect(() => {
    if (typeof document === 'undefined') return
    document.title = resolveTitle()

    const description = route.meta.description
    if (typeof description !== 'string') return

    let tag = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    if (!tag) {
      tag = document.createElement('meta')
      tag.name = 'description'
      document.head.appendChild(tag)
    }
    tag.content = translateIfPresent(description) ?? description
  })
}
