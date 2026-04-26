import { useAppStorage } from '~/composables/useAppStorage'
import type { ShapeBorder, ShapeRadius, ShapeShadow } from '~/composables/useShape'

const STORAGE_PREFIX = 'vuestrata-shape'

export const useShapeState = createGlobalState(() => {
  const radius = useAppStorage<ShapeRadius>(`${STORAGE_PREFIX}-radius`, 'medium')
  const border = useAppStorage<ShapeBorder>(`${STORAGE_PREFIX}-border`, 'thin')
  const shadow = useAppStorage<ShapeShadow>(`${STORAGE_PREFIX}-shadow`, 'medium')

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
