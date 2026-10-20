import { useThemeColors } from '@/composables/useThemeColors'

import {
  CHART_FAMILIES,
  CHART_GALLERY,
  type GalleryChartContext,
  type GalleryChartFamily,
} from '../lib/chart-gallery'
import { useDashboardI18n } from './useDashboardI18n'

function searchable(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

export function useChartGallery() {
  const { dt, locale } = useDashboardI18n()
  const colors = useThemeColors()
  const { currentThemeName } = useTheme()
  const search = ref('')
  const family = ref<GalleryChartFamily | 'all'>('all')
  const fontFamily = ref('sans-serif')
  const fontReady = ref(false)

  function readFont() {
    if (typeof document !== 'undefined') {
      fontFamily.value = getComputedStyle(document.body).fontFamily
    }
  }

  watch([currentThemeName, locale], readFont, { immediate: true, flush: 'post' })
  onMounted(async () => {
    await document.fonts.ready
    readFont()
    fontReady.value = true
  })

  const context = computed<GalleryChartContext>(() => {
    // Rebuild canvas text after the initial font load, even if its CSS family
    // string stayed the same while the font file was still being fetched.
    void fontReady.value
    return {
      palette: colors.series.value,
      foreground: colors.foreground.value,
      mutedForeground: colors.mutedForeground.value,
      border: colors.border.value,
      surface: colors.elevated.value,
      fontFamily: fontFamily.value,
      t: dt,
    }
  })

  const examples = computed(() => {
    const query = searchable(search.value.trim())
    return CHART_GALLERY.filter((example) => {
      if (family.value !== 'all' && example.family !== family.value) return false
      if (!query) return true
      const key = example.id.replaceAll('-', '_')
      return searchable(
        [
          example.id,
          dt(`chart_gallery_${key}_title`),
          dt(`chart_gallery_${key}_desc`),
          dt(`chart_gallery_family_${example.family}`),
        ].join(' '),
      ).includes(query)
    })
  })

  const families = CHART_FAMILIES.map((id) => ({
    id,
    count: CHART_GALLERY.filter((example) => example.family === id).length,
  }))

  function resetFilters() {
    search.value = ''
    family.value = 'all'
  }

  return {
    dt,
    search,
    family,
    examples,
    families,
    context,
    resetFilters,
    total: CHART_GALLERY.length,
  }
}
