<script setup lang="ts">
import { renderMermaidSVG, THEMES, type RenderOptions } from 'beautiful-mermaid'

import { resolveIcon } from '~/config/icon-provider'

const MIN_ZOOM = 0.4
const MAX_ZOOM = 3
const ZOOM_STEP = 0.2
const THEME_LABELS: Record<string, string> = {
  'zinc-light': 'Zinc Light',
  'zinc-dark': 'Zinc Dark',
  'tokyo-night': 'Tokyo Night',
  'tokyo-night-storm': 'Tokyo Storm',
  'tokyo-night-light': 'Tokyo Light',
  'catppuccin-mocha': 'Catppuccin Mocha',
  'catppuccin-latte': 'Catppuccin Latte',
  nord: 'Nord',
  'nord-light': 'Nord Light',
  dracula: 'Dracula',
  'github-light': 'GitHub Light',
  'github-dark': 'GitHub Dark',
  'solarized-light': 'Solarized Light',
  'solarized-dark': 'Solarized Dark',
  'one-dark': 'One Dark',
}

const props = withDefaults(
  defineProps<{
    content?: string
    theme?: string
    themeDark?: string
    width?: string
    height?: string
  }>(),
  {
    content: '',
    theme: 'github-light',
    themeDark: 'github-dark',
    width: '100%',
    height: 'auto',
  },
)

const { isDark } = useTheme()
const isPreviewOpen = ref(false)
const selectedTheme = ref('')
const scale = ref(1)
const pan = reactive({ x: 0, y: 0 })
const dragStart = reactive({ x: 0, y: 0, panX: 0, panY: 0 })
const isDragging = ref(false)

function resolveTheme(name: string): RenderOptions {
  const fallback = THEMES['github-light'] as RenderOptions
  return (THEMES[name as keyof typeof THEMES] as RenderOptions | undefined) ?? fallback
}

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

function resetPreview() {
  scale.value = 1
  pan.x = 0
  pan.y = 0
}

function zoomBy(delta: number) {
  scale.value = clampZoom(Number((scale.value + delta).toFixed(2)))
}

function openPreview() {
  resetPreview()
  isPreviewOpen.value = true
}

function startPan(event: PointerEvent) {
  if (event.button !== 0) return
  isDragging.value = true
  dragStart.x = event.clientX
  dragStart.y = event.clientY
  dragStart.panX = pan.x
  dragStart.panY = pan.y

  const target = event.currentTarget
  if (target instanceof HTMLElement) target.setPointerCapture(event.pointerId)
}

function movePan(event: PointerEvent) {
  if (!isDragging.value) return
  pan.x = dragStart.panX + event.clientX - dragStart.x
  pan.y = dragStart.panY + event.clientY - dragStart.y
}

function stopPan(event: PointerEvent) {
  isDragging.value = false
  const target = event.currentTarget
  if (target instanceof HTMLElement && target.hasPointerCapture(event.pointerId)) {
    target.releasePointerCapture(event.pointerId)
  }
}

function onWheel(event: WheelEvent) {
  zoomBy(event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP)
}

function formatThemeLabel(name: string): string {
  return (
    THEME_LABELS[name] ??
    name
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  )
}

const themeOptions = computed(() => [
  { label: `Auto (${formatThemeLabel(isDark.value ? props.themeDark : props.theme)})`, value: '' },
  ...Object.keys(THEMES).map((name) => ({ label: formatThemeLabel(name), value: name })),
])

const resolvedThemeName = computed(
  () => selectedTheme.value || (isDark.value ? props.themeDark : props.theme),
)

const rendered = computed(() => {
  try {
    const svg = renderMermaidSVG(props.content.trim(), {
      ...resolveTheme(resolvedThemeName.value),
      font: 'Inter, ui-sans-serif, system-ui, sans-serif',
      transparent: true,
    })

    return { svg, error: '' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to render Mermaid diagram.'
    return { svg: '', error: message }
  }
})

const containerStyle = computed(() => ({
  width: props.width,
  height: props.height,
}))

const previewStyle = computed(() => ({
  transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale.value})`,
}))

const zoomLabel = computed(() => `${Math.round(scale.value * 100)}%`)
</script>

<template>
  <figure
    class="group border-surface-200 dark:border-surface-700 dark:bg-surface-900 relative my-6 overflow-auto rounded-lg border bg-white p-4"
    :style="containerStyle"
  >
    <div v-if="rendered.svg" class="relative">
      <UiButton
        class="absolute end-2 top-2 z-10 shadow-sm"
        variant="ghost"
        size="sm"
        :icon="resolveIcon('zoom-in')"
        aria-label="Open Mermaid diagram preview"
        title="Open Mermaid diagram preview"
        @click="openPreview"
      />

      <div
        class="docs-mermaid [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
        v-html="rendered.svg"
      />
    </div>

    <div v-else class="space-y-3">
      <p class="text-destructive text-sm font-medium">Mermaid render failed.</p>
      <p class="text-muted-foreground text-sm">{{ rendered.error }}</p>
      <pre
        class="bg-surface-100 dark:bg-surface-950 overflow-auto rounded p-3 text-xs"
      ><code>{{ props.content }}</code></pre>
    </div>

    <UiDialog
      v-if="rendered.svg"
      v-model:open="isPreviewOpen"
      title="Mermaid diagram"
      content-class="!w-[96vw] !max-w-[1200px]"
    >
      <div class="mt-4 flex h-[min(72vh,680px)] min-h-105 flex-col gap-3">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div class="max-w-72 min-w-55 flex-1">
            <UiSelect
              v-model="selectedTheme"
              label="Theme"
              placeholder="Choose theme"
              :options="themeOptions"
            />
          </div>
          <div class="flex items-center gap-1.5 pb-0.5">
            <div
              class="border-surface-200 bg-surface-50 text-surface-600 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-300 rounded-md border px-2.5 py-1 text-xs font-medium tabular-nums"
            >
              {{ zoomLabel }}
            </div>
            <UiButton
              variant="ghost"
              size="sm"
              :icon="resolveIcon('zoom-out')"
              :disabled="scale <= MIN_ZOOM"
              aria-label="Zoom out"
              title="Zoom out"
              @click="zoomBy(-ZOOM_STEP)"
            />
            <UiButton
              variant="ghost"
              size="sm"
              :icon="resolveIcon('zoom-in')"
              :disabled="scale >= MAX_ZOOM"
              aria-label="Zoom in"
              title="Zoom in"
              @click="zoomBy(ZOOM_STEP)"
            />
            <UiButton
              variant="ghost"
              size="sm"
              :icon="resolveIcon('refresh')"
              aria-label="Reset view"
              title="Reset view"
              @click="resetPreview"
            />
          </div>
        </div>

        <div
          :class="[
            'border-surface-200 bg-surface-50 dark:border-surface-700 dark:bg-surface-950 relative min-h-0 flex-1 touch-none overflow-hidden rounded-lg border',
            isDragging ? 'cursor-grabbing' : 'cursor-grab',
          ]"
          @pointerdown="startPan"
          @pointermove="movePan"
          @pointerup="stopPan"
          @pointercancel="stopPan"
          @pointerleave="stopPan"
          @wheel.prevent="onWheel"
        >
          <div
            class="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgb(148_163_184/0.18)_1px,transparent_1px),linear-gradient(to_bottom,rgb(148_163_184/0.18)_1px,transparent_1px)] bg-size-[24px_24px] opacity-[0.35]"
          />
          <div class="absolute inset-0 flex items-center justify-center p-8">
            <div
              class="docs-mermaid-preview origin-center transition-transform duration-100 ease-out select-none motion-reduce:transition-none [&_svg]:h-auto [&_svg]:max-h-[62vh] [&_svg]:max-w-full"
              :style="previewStyle"
              v-html="rendered.svg"
            />
          </div>
        </div>
      </div>
    </UiDialog>
  </figure>
</template>
