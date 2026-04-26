import { useShapeState } from '@/state/shape'

export type ShapeRadius = 'none' | 'small' | 'medium' | 'large' | 'full'
export type ShapeBorder = 'none' | 'thin' | 'medium' | 'bold'
export type ShapeShadow = 'none' | 'subtle' | 'medium' | 'elevated'

/**
 * Composable accessor for the shared shape state. Persistence and the
 * one-time DOM sync watcher live inside `useShapeState` (a `createGlobalState`
 * factory in `app/state/shape.ts`); this composable is a thin wrapper that
 * exposes refs and setters to consumers.
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
