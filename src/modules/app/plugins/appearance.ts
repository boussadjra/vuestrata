/**
 * Appearance contract — single source of truth for the three persisted
 * preferences that affect first paint: dark mode, theme, and locale.
 *
 * Both the synchronous pre-mount bootstrap (`bootstrap-theme.ts`) and the
 * reactive post-mount sync (`useThemeSync` in `composables/useTheme.ts`)
 * consume the same `applyAppearance()` helper, so the DOM is mutated in
 * exactly one place. The Pinia store imports the same storage keys to keep
 * persistence aligned.
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

const RTL_LOCALES = new Set<SupportedLocale>(['ar'])

// Defence in depth: only allow safe identifiers in values that get spliced
// into class names / DOM attributes (in case localStorage was tampered with).
const THEME_PATTERN = /^[a-z0-9-]+$/

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
  return saved && THEME_PATTERN.test(saved) ? saved : 'default'
}

function readLocale(): SupportedLocale {
  const saved = readStorage(APPEARANCE_KEYS.locale)
  return (SUPPORTED_LOCALES as readonly string[]).includes(saved ?? '')
    ? (saved as SupportedLocale)
    : 'en'
}
