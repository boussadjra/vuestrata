import { useI18n } from 'vue-i18n'

/**
 * Announces client-side navigations and restores focus.
 *
 * A full page load gives assistive technology two things for free: the new
 * document title is announced, and focus resets to the top of the page. An SPA
 * route change gives neither — the URL changes, the DOM swaps, and a screen
 * reader user hears nothing while keyboard focus stays wherever it was, often
 * on a nav item that no longer relates to what is on screen.
 *
 * This restores both:
 *   1. Writes the new page's name into an `aria-live="polite"` region.
 *   2. Moves focus to the `<main>` element (which needs `tabindex="-1"`).
 *
 * Focus moves on the NEXT tick, after the new route's component has rendered,
 * so the element being focused is the new page rather than the old one.
 */
export function useRouteAnnouncer() {
  const route = useRoute()
  const { t } = useI18n()

  const announcement = ref('')
  const mainRef = ref<HTMLElement | null>(null)

  function resolveRouteName(): string {
    const titleKey = route.meta.title
    if (typeof titleKey === 'string') {
      const translated = t(titleKey)
      // vue-i18n returns the key itself when there is no message for it.
      if (translated !== titleKey) return translated
    }
    if (typeof document !== 'undefined' && document.title) return document.title
    return route.path
  }

  watch(
    () => route.fullPath,
    async () => {
      announcement.value = t('a11y_navigated_to', { page: resolveRouteName() })
      await nextTick()
      mainRef.value?.focus()
    },
  )

  return { announcement, mainRef }
}
