import { useAppStorage } from '~/composables/useAppStorage'
import type { ShapeBorder, ShapeRadius, ShapeShadow } from '~/composables/useShape'

const STORAGE_PREFIX = 'vuestrata-shape'

function normalizeRadius(value: ShapeRadius | 'full' | null | undefined): ShapeRadius {
  if (value === 'none' || value === 'small' || value === 'medium' || value === 'large') {
    return value
  }

  return 'large'
}

export const useShapeState = createGlobalState(() => {
  const radiusStorage = useAppStorage<ShapeRadius | 'full'>(`${STORAGE_PREFIX}-radius`, 'medium')
  const radius = computed<ShapeRadius>({
    get: () => normalizeRadius(radiusStorage.value),
    set: (value) => {
      radiusStorage.value = value
    },
  })
  const border = useAppStorage<ShapeBorder>(`${STORAGE_PREFIX}-border`, 'thin')
  const shadow = useAppStorage<ShapeShadow>(`${STORAGE_PREFIX}-shadow`, 'medium')

  const normalizedRadius = normalizeRadius(radiusStorage.value)
  if (radiusStorage.value !== normalizedRadius) {
    radiusStorage.value = normalizedRadius
  }

  function applyClasses(): void {
    if (typeof window === 'undefined') return
    const html = document.documentElement
    const toRemove = Array.from(html.classList).filter((c) => c.startsWith('shape-'))
    for (const cls of toRemove) html.classList.remove(cls)
    if (radius.value !== 'medium') html.classList.add(`shape-radius-${radius.value}`)
    if (border.value !== 'thin') html.classList.add(`shape-border-${border.value}`)
    if (shadow.value !== 'medium') html.classList.add(`shape-shadow-${shadow.value}`)
  }

  if (typeof window !== 'undefined') {
    watch([radius, border, shadow], applyClasses, { immediate: true })
  }

  return { radius, border, shadow }
})
