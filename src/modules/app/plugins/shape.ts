/**
 * Shape contract — persisted radius, border, and shadow that affect first paint.
 *
 * Same split as `appearance.ts`: a framework-free reader/writer for the
 * pre-mount bootstrap, plus the storage keys the reactive `useShapeState`
 * hydrates from so a refresh cannot drop the user back to the theme default.
 */

export type ShapeRadius = 'none' | 'small' | 'medium' | 'large'
export type ShapeBorder = 'none' | 'thin' | 'medium' | 'bold'
export type ShapeShadow = 'none' | 'subtle' | 'medium' | 'elevated'

export const SHAPE_KEYS = {
  radius: 'vuestrata-shape-radius',
  border: 'vuestrata-shape-border',
  shadow: 'vuestrata-shape-shadow',
} as const

export const SHAPE_DEFAULTS = {
  radius: 'medium',
  border: 'thin',
  shadow: 'medium',
} as const satisfies {
  radius: ShapeRadius
  border: ShapeBorder
  shadow: ShapeShadow
}

const RADIUS_VALUES = new Set<ShapeRadius>(['none', 'small', 'medium', 'large'])
const BORDER_VALUES = new Set<ShapeBorder>(['none', 'thin', 'medium', 'bold'])
const SHADOW_VALUES = new Set<ShapeShadow>(['none', 'subtle', 'medium', 'elevated'])

export interface ShapeAppearance {
  radius: ShapeRadius
  border: ShapeBorder
  shadow: ShapeShadow
}

export function normalizeRadius(value: string | null | undefined): ShapeRadius {
  if (value && RADIUS_VALUES.has(value as ShapeRadius)) return value as ShapeRadius
  // Retired option: "full" was the most rounded preset.
  if (value === 'full') return 'large'
  return SHAPE_DEFAULTS.radius
}

export function normalizeBorder(value: string | null | undefined): ShapeBorder {
  if (value && BORDER_VALUES.has(value as ShapeBorder)) return value as ShapeBorder
  return SHAPE_DEFAULTS.border
}

export function normalizeShadow(value: string | null | undefined): ShapeShadow {
  if (value && SHADOW_VALUES.has(value as ShapeShadow)) return value as ShapeShadow
  return SHAPE_DEFAULTS.shadow
}

/**
 * Apply a shape snapshot to `<html>`. Medium / thin / medium are the CSS
 * defaults, so those values add no class — matching `state/shape.ts`.
 */
export function applyShape(partial: Partial<ShapeAppearance>): void {
  if (typeof document === 'undefined') return

  const html = document.documentElement
  const next: ShapeAppearance = {
    radius: partial.radius ?? readRadius(),
    border: partial.border ?? readBorder(),
    shadow: partial.shadow ?? readShadow(),
  }

  for (const cls of Array.from(html.classList)) {
    if (cls.startsWith('shape-')) html.classList.remove(cls)
  }

  if (next.radius !== SHAPE_DEFAULTS.radius) {
    html.classList.add(`shape-radius-${next.radius}`)
  }
  if (next.border !== SHAPE_DEFAULTS.border) {
    html.classList.add(`shape-border-${next.border}`)
  }
  if (next.shadow !== SHAPE_DEFAULTS.shadow) {
    html.classList.add(`shape-shadow-${next.shadow}`)
  }
}

export function readPersistedShape(): ShapeAppearance {
  return {
    radius: readRadius(),
    border: readBorder(),
    shadow: readShadow(),
  }
}

function readStorage(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key)
  } catch {
    return null
  }
}

function readRadius(): ShapeRadius {
  return normalizeRadius(readStorage(SHAPE_KEYS.radius))
}

function readBorder(): ShapeBorder {
  return normalizeBorder(readStorage(SHAPE_KEYS.border))
}

function readShadow(): ShapeShadow {
  return normalizeShadow(readStorage(SHAPE_KEYS.shadow))
}
