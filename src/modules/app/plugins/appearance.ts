/**
 * Appearance contract — single source of truth for the three persisted
 * preferences that affect first paint: dark mode, theme, and locale.
 *
 * Both the synchronous pre-mount bootstrap (`bootstrap-theme.ts`) and the
 * reactive post-mount sync (`useThemeSync` / `useLocaleSync`) consume the
 * same `applyAppearance()` helper, so the DOM is mutated in exactly one
 * place. The Pinia store imports the same storage keys to keep persistence
 * aligned.
 *
 * In-app documentation is English/LTR only. `resolveActiveLocale()` is the
 * single override: it never writes the persisted preference, so leaving
 * `/docs` restores French or Arabic exactly as the user left them.
 *
 * Why a plain module and not a composable?
 *   - The pre-mount path runs before `createApp()`, so reactivity is not
 *     available yet. Composables would throw outside of an active Vue
 *     instance.
 *   - Keeping the DOM writer pure and framework-free makes it trivially
 *     testable and reusable from anywhere (workers, SSR shims, etc.).
 */

export const APPEARANCE_KEYS = {
  dark: 'vuestrata-dark',
  theme: 'vuestrata-theme',
  locale: 'vuestrata-locale',
} as const

export const SUPPORTED_LOCALES = ['en', 'fr', 'ar'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

/**
 * Display metadata for the locale switcher.
 *
 * The label is the *endonym* — the language's name in itself — and is
 * deliberately not translated. A user who has landed in a language they cannot
 * read needs "Français" to find French; "French" in Arabic script does not help
 * them, and it is the one string in the app that must never be localized.
 *
 * Lives here, next to `SUPPORTED_LOCALES`, so adding a language is a single
 * edit. It used to be a second hand-written list inside `AppHeader.vue`, which
 * could (and did) fall out of step with the locales the app actually loads.
 */
export const LOCALE_METADATA: Record<SupportedLocale, { label: string; flag: string }> = {
  en: { label: 'English', flag: '🇬🇧' },
  fr: { label: 'Français', flag: '🇫🇷' },
  ar: { label: 'العربية', flag: '🇸🇦' },
}

const RTL_LOCALES = new Set<SupportedLocale>(['ar'])

/** Whether a locale is written right-to-left. */
export function isRtlLocale(locale: string): boolean {
  return RTL_LOCALES.has(locale as SupportedLocale)
}

/**
 * Docs are authored in English. The chrome, markdown, and demos all assume
 * LTR, so `/docs` never follows a persisted French or Arabic preference.
 */
export const DOCS_LOCALE: SupportedLocale = 'en'

/**
 * Whether `pathname` is the in-app documentation tree.
 *
 * Trailing slashes and query/hash suffixes are ignored so `/docs/`,
 * `/docs/theming/overview?x=1`, and the router path all agree.
 */
export function isDocsPath(pathname: string): boolean {
  const path = pathname.split(/[?#]/, 1)[0] ?? pathname
  const normalized = path.replace(/\/+$/, '') || '/'
  return normalized === '/docs' || normalized.startsWith('/docs/')
}

/**
 * Locale that should actually be applied to `<html>` and vue-i18n.
 *
 * The persisted value is unchanged: this is a render-time override so a
 * reader can open the docs from an Arabic session without flipping their
 * saved language, and without the markdown laying out RTL.
 */
export function resolveActiveLocale(pathname: string, persisted: SupportedLocale): SupportedLocale {
  return isDocsPath(pathname) ? DOCS_LOCALE : persisted
}

// Defence in depth: only allow safe identifiers in values that get spliced
// into class names / DOM attributes (in case localStorage was tampered with).
const THEME_PATTERN = /^[a-z0-9-]+$/

/**
 * Themes that have been renamed, old name → new name.
 *
 * A persisted theme is a choice the user actually made, and `readTheme()`
 * validates the *shape* of the stored value, not that a theme by that name
 * still exists. Without this map a rename leaves the old value in storage
 * where it passes validation, resolves to no registered theme, and silently
 * drops the user back to Default with no indication why.
 *
 * Entries can be removed once the affected releases are far enough behind that
 * nobody is still carrying the old value.
 */
const THEME_ALIASES: Record<string, string> = {
  // Renamed in 1.0.1-alpha: "Febin" named nobody and described nothing.
  febin: 'harbour',
}

/**
 * Resolve a stored theme name through the rename map.
 *
 * Exported because there are TWO readers of the persisted theme and they run at
 * different times: this module's `readTheme()` on the pre-mount bootstrap, and
 * the Pinia store's `useAppStorage` after mount. Migrating only the first one
 * would paint the right theme for a frame and then have the store hydrate the
 * stale name straight back over it.
 */
export function normalizeThemeName(name: string): string {
  return THEME_ALIASES[name] ?? name
}

export interface Appearance {
  dark: boolean
  /** Theme name. Used to derive a `theme-<name>` class unless `themeClass` is provided. */
  theme: string
  /**
   * Optional explicit class to apply for the theme — used by post-mount code
   * that has access to the theme registry and may register custom themes
   * with non-conventional class names. When omitted, `theme-<theme>` is used.
   */
  themeClass: string
  locale: SupportedLocale
}

/**
 * Apply an appearance snapshot to `<html>`. Pure — safe to call from any
 * environment; returns immediately when `document` is unavailable.
 */
export function applyAppearance(partial: Partial<Appearance>): void {
  if (typeof document === 'undefined') return

  const html = document.documentElement

  if (partial.dark !== undefined) {
    html.classList.toggle('dark', partial.dark)
  }

  if (partial.theme !== undefined || partial.themeClass !== undefined) {
    // Drop any prior theme-* class before applying the new one.
    for (const cls of Array.from(html.classList)) {
      if (cls.startsWith('theme-')) html.classList.remove(cls)
    }
    const cls =
      partial.themeClass ??
      (partial.theme && partial.theme !== 'default' && THEME_PATTERN.test(partial.theme)
        ? `theme-${partial.theme}`
        : '')
    if (cls) html.classList.add(cls)
  }

  if (partial.locale !== undefined) {
    html.lang = partial.locale
    html.dir = RTL_LOCALES.has(partial.locale) ? 'rtl' : 'ltr'
  }
}

/**
 * Read the persisted appearance from `localStorage`, falling back to system
 * preferences and validating each value. Used by the pre-mount bootstrap to
 * paint the correct theme on the very first frame (no FOUC).
 */
export function readPersistedAppearance(): Pick<Appearance, 'dark' | 'theme' | 'locale'> {
  return {
    dark: readDark(),
    theme: readTheme(),
    locale: readLocale(),
  }
}

function readStorage(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key)
  } catch {
    // Private browsing / disabled storage — fall through to defaults.
    return null
  }
}

function readDark(): boolean {
  const saved = readStorage(APPEARANCE_KEYS.dark)
  if (saved === 'true') return true
  if (saved === 'false') return false
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

function readTheme(): string {
  const saved = readStorage(APPEARANCE_KEYS.theme)
  if (!saved || !THEME_PATTERN.test(saved)) return 'default'
  return normalizeThemeName(saved)
}

function readLocale(): SupportedLocale {
  const saved = readStorage(APPEARANCE_KEYS.locale)
  return (SUPPORTED_LOCALES as readonly string[]).includes(saved ?? '')
    ? (saved as SupportedLocale)
    : 'en'
}
