/**
 * Pre-mount appearance bootstrap.
 *
 * Reads the persisted dark-mode, theme, and locale preferences and applies
 * them to `<html>` synchronously, before Vue mounts. This is the first frame
 * the user will see, so doing it here (rather than waiting for `useThemeSync`
 * inside `App.vue`) prevents a flash of the wrong theme/colours/direction.
 *
 * All real work lives in `./appearance` so the same DOM writer and storage
 * keys are reused by the reactive post-mount sync and by the Pinia store.
 * This module is intentionally a one-line entry point.
 */

import { applyAppearance, readPersistedAppearance } from './appearance'

/** Apply persisted appearance to `<html>` synchronously. */
export function bootstrapTheme(): void {
  applyAppearance(readPersistedAppearance())
}
