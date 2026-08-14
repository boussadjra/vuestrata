import { useShapeState } from '@/state/shape'
import type { ShapeBorder, ShapeRadius, ShapeShadow } from '~/plugins/shape'

export type { ShapeBorder, ShapeRadius, ShapeShadow }

/**
 * Composable accessor for the shared shape state. Persistence and the
 * DOM sync watcher live inside `useShapeState`; this composable is a thin
 * wrapper that exposes refs and setters to consumers.
 */
export function useShape() {
  const { radius, border, shadow } = useShapeState()

  function setRadius(v: ShapeRadius) {
    radius.value = v
  }
  function setBorder(v: ShapeBorder) {
    border.value = v
  }
  function setShadow(v: ShapeShadow) {
    shadow.value = v
  }

  return {
    radius,
    border,
    shadow,
    setRadius,
    setBorder,
    setShadow,
  }
}

/**
 * Keep persisted shape classes on `<html>` for the app lifetime.
 *
 * Call from the app root. Settings used to be the only caller of `useShape()`,
 * so a refresh on any other page never re-applied `shape-radius-*` and the
 * UI snapped back to the theme default even though localStorage still held
 * the choice.
 */
export function useShapeSync() {
  useShapeState()
}
