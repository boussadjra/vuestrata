/**
 * Pre-mount appearance bootstrap.
 *
 * Reads the persisted dark-mode, theme, locale, and shape preferences and
 * applies them to `<html>` synchronously, before Vue mounts. This is the first
 * frame the user will see, so doing it here (rather than waiting for
 * `useThemeSync` / `useShapeSync` inside `App.vue`) prevents a flash of the
 * wrong theme, colours, direction, or border radius.
 *
 * All real work lives in `./appearance` and `./shape` so the same DOM writers
 * and storage keys are reused by the reactive post-mount sync.
 */

import { applyAppearance, readPersistedAppearance } from './appearance'
import { applyShape, readPersistedShape } from './shape'

/** Apply persisted appearance and shape to `<html>` synchronously. */
export function bootstrapTheme(): void {
  applyAppearance(readPersistedAppearance())
  applyShape(readPersistedShape())
}
