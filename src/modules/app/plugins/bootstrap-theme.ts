/**
 * Pre-mount appearance bootstrap.
 *
 * Reads the persisted dark-mode, theme, locale, and shape preferences and
 * applies them to `<html>` synchronously, before Vue mounts. This is the first
 * frame the user will see, so doing it here (rather than waiting for
 * `useThemeSync` / `useLocaleSync` / `useShapeSync` inside `App.vue`)
 * prevents a flash of the wrong theme, colours, direction, or border
 * radius. Documentation URLs force English/LTR here too, so a first
 * paint on `/docs` is never RTL.
 *
 * All real work lives in `./appearance` and `./shape` so the same DOM writers
 * and storage keys are reused by the reactive post-mount sync.
 */

import { applyAppearance, readPersistedAppearance, resolveActiveLocale } from './appearance'
import { applyShape, readPersistedShape } from './shape'

/** Apply persisted appearance and shape to `<html>` synchronously. */
export function bootstrapTheme(): void {
  const appearance = readPersistedAppearance()
  const pathname = typeof window === 'undefined' ? '/' : window.location.pathname
  applyAppearance({
    ...appearance,
    locale: resolveActiveLocale(pathname, appearance.locale),
  })
  applyShape(readPersistedShape())
}
