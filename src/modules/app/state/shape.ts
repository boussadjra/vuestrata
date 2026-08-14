import { useAppStorage } from '~/composables/useAppStorage'
import {
  applyShape,
  normalizeBorder,
  normalizeRadius,
  normalizeShadow,
  SHAPE_DEFAULTS,
  SHAPE_KEYS,
  type ShapeBorder,
  type ShapeRadius,
  type ShapeShadow,
} from '~/plugins/shape'

export const useShapeState = createGlobalState(() => {
  const radiusStorage = useAppStorage<ShapeRadius | 'full'>(
    SHAPE_KEYS.radius,
    SHAPE_DEFAULTS.radius,
  )
  const radius = computed<ShapeRadius>({
    get: () => normalizeRadius(radiusStorage.value),
    set: (value) => {
      radiusStorage.value = value
    },
  })
  const borderStorage = useAppStorage<ShapeBorder>(SHAPE_KEYS.border, SHAPE_DEFAULTS.border)
  const border = computed<ShapeBorder>({
    get: () => normalizeBorder(borderStorage.value),
    set: (value) => {
      borderStorage.value = value
    },
  })
  const shadowStorage = useAppStorage<ShapeShadow>(SHAPE_KEYS.shadow, SHAPE_DEFAULTS.shadow)
  const shadow = computed<ShapeShadow>({
    get: () => normalizeShadow(shadowStorage.value),
    set: (value) => {
      shadowStorage.value = value
    },
  })

  const normalizedRadius = normalizeRadius(radiusStorage.value)
  if (radiusStorage.value !== normalizedRadius) {
    radiusStorage.value = normalizedRadius
  }

  function syncClasses(): void {
    applyShape({
      radius: radius.value,
      border: border.value,
      shadow: shadow.value,
    })
  }

  if (typeof window !== 'undefined') {
    watch([radius, border, shadow], syncClasses, { immediate: true })
  }

  return { radius, border, shadow }
})
