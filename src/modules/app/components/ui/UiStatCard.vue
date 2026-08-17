<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'

import type { IconName } from '~/types'

import AppIcon from './AppIcon.vue'
import { folderClipPath } from './stat-card-path'
import UiSkeleton from './UiSkeleton.vue'
import UiTrendDelta from './UiTrendDelta.vue'

export interface StatCardProps {
  label: string
  /** Already formatted for the active locale by the caller. */
  value: string
  /** Optional supporting line, e.g. the comparison window. */
  hint?: string
  trend?: {
    changePercent: number
    direction: 'up' | 'down' | 'flat'
    isImprovement: boolean
    comparedTo?: string
  }
  /** Decorative metric mark. Hidden from assistive technology. */
  icon?: IconName
  loading?: boolean
}

withDefaults(defineProps<StatCardProps>(), { loading: false })

const headingId = useId()
const cardRef = ref<HTMLElement | null>(null)
const tabRef = ref<HTMLElement | null>(null)
const radiusRef = ref<HTMLElement | null>(null)
const clipPath = ref('none')

function updateClipPath() {
  const card = cardRef.value
  const tab = tabRef.value
  if (!card || !tab) return

  const d = folderClipPath({
    width: card.clientWidth,
    height: card.clientHeight,
    tabWidth: tab.offsetWidth,
    tabHeight: tab.offsetHeight,
    radius: radiusRef.value?.offsetWidth ?? 0,
    rtl: getComputedStyle(card).direction === 'rtl',
  })

  clipPath.value = d ? `path('${d}')` : 'none'
}

useResizeObserver(cardRef, updateClipPath)
useResizeObserver(tabRef, updateClipPath)
onMounted(updateClipPath)
</script>

<template>
  <!--
    One painted surface, clipped to a single folder path. The tab is only
    layout — it sizes to the title so the path can follow it. Drop-shadow on
    the shell strokes that clipped silhouette.
  -->
  <div class="ui-stat-card-shell">
    <section
      ref="cardRef"
      :aria-labelledby="headingId"
      :style="{ clipPath, WebkitClipPath: clipPath }"
      data-ui="card"
      data-shape="tabbed"
      class="ui-stat-card"
    >
      <span ref="radiusRef" class="ui-stat-card__radius" aria-hidden="true" />
      <div ref="tabRef" class="ui-stat-card__tab">
        <AppIcon v-if="icon" :name="icon" size="sm" class="text-muted-foreground shrink-0" />
        <p :id="headingId" class="text-muted-foreground text-xs font-medium whitespace-nowrap">
          {{ label }}
        </p>
      </div>

      <div class="ui-stat-card__body">
        <template v-if="loading">
          <UiSkeleton class="h-8 w-28" />
          <UiSkeleton class="h-4 w-20" />
        </template>

        <template v-else>
          <p class="text-foreground text-2xl font-bold tabular-nums">{{ value }}</p>
          <div class="flex min-h-5 flex-wrap items-center gap-x-2 gap-y-0.5">
            <UiTrendDelta
              v-if="trend"
              :change-percent="trend.changePercent"
              :direction="trend.direction"
              :is-improvement="trend.isImprovement"
              :compared-to="trend.comparedTo"
              size="sm"
            />
            <span v-if="hint" class="text-muted-foreground text-xs">{{ hint }}</span>
          </div>
        </template>

        <slot />
      </div>
    </section>
  </div>
</template>

<style>
/*
 * Folder silhouette — one clip path, one fill:
 *
 *   ╭── title ──╲
 *   │            ╲─────────────╮
 *   │                          │
 *   ╰──────────────────────────╯
 */
.ui-stat-card-shell {
  --stat-card-outline: var(--color-border);
  --stat-card-elevation: 0 1px 2px color-mix(in oklch, var(--color-surface-900) 14%, transparent);
  width: 100%;
  min-width: 0;
  filter: drop-shadow(var(--shape-border-width, 1px) 0 0 var(--stat-card-outline))
    drop-shadow(calc(-1 * var(--shape-border-width, 1px)) 0 0 var(--stat-card-outline))
    drop-shadow(0 var(--shape-border-width, 1px) 0 var(--stat-card-outline))
    drop-shadow(0 calc(-1 * var(--shape-border-width, 1px)) 0 var(--stat-card-outline))
    drop-shadow(var(--stat-card-elevation));
}

:root.shape-border-none .ui-stat-card-shell {
  --stat-card-outline: transparent;
}

:root.shape-shadow-none .ui-stat-card-shell {
  --stat-card-elevation: 0 0 0 transparent;
}

:root.theme-brutalist .ui-stat-card-shell {
  --stat-card-elevation: 4px 4px 0 var(--color-border);
}

:root.theme-brutalist[dir='rtl'] .ui-stat-card-shell,
:root.theme-brutalist:dir(rtl) .ui-stat-card-shell {
  --stat-card-elevation: -4px 4px 0 var(--color-border);
}

:root.theme-blueprint .ui-stat-card-shell {
  --stat-card-elevation: 2px 2px 0 var(--color-border);
}

:root.theme-blueprint[dir='rtl'] .ui-stat-card-shell,
:root.theme-blueprint:dir(rtl) .ui-stat-card-shell {
  --stat-card-elevation: -2px 2px 0 var(--color-border);
}

.ui-stat-card {
  --stat-r: var(--shape-radius-lg);
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
}

.ui-stat-card__radius {
  position: absolute;
  width: var(--stat-r);
  height: 0;
  overflow: hidden;
  pointer-events: none;
}

.ui-stat-card__tab {
  display: flex;
  align-self: start;
  align-items: center;
  gap: 0.375rem;
  width: max-content;
  padding: 0.375rem 0.875rem 0.3125rem;
}

.ui-stat-card__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  justify-content: center;
  gap: 0.5rem;
  min-width: 0;
  min-height: 6.5rem;
  padding: 1.25rem 1.125rem 1.375rem;
}

@media (forced-colors: active) {
  .ui-stat-card-shell {
    filter: none;
  }

  .ui-stat-card {
    clip-path: none !important;
    border: 1px solid CanvasText !important;
  }
}
</style>
