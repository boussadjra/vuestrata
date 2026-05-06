<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { useTheme } from '@/composables/useTheme'
import { resolveIcon } from '@/config/icon-provider'

import HeroCodePreview from './HeroCodePreview.vue'

type StackItem = {
  icon: string
  label: string
  desc: string
}

defineProps<{
  stackItems: StackItem[]
}>()

const { t } = useI18n()
const { isDark } = useTheme()
const mouseX = ref(0)
const mouseY = ref(0)

let rafId: number | null = null

function handleMouseMove(e: MouseEvent) {
  if (rafId !== null) return
  rafId = requestAnimationFrame(() => {
    const { innerWidth, innerHeight } = window
    mouseX.value = (e.clientX / innerWidth - 0.5) * 14
    mouseY.value = (e.clientY / innerHeight - 0.5) * 14
    rafId = null
  })
}

onMounted(() => window.addEventListener('mousemove', handleMouseMove, { passive: true }))
onUnmounted(() => {
  window.removeEventListener('mousemove', handleMouseMove)
  if (rafId !== null) cancelAnimationFrame(rafId)
})
</script>

<template>
  <section class="relative flex min-h-[calc(100svh-5rem)] items-center overflow-hidden">
    <div class="pointer-events-none absolute inset-0 select-none" aria-hidden="true">
      <div class="hero-dots absolute inset-0" />
      <div class="hero-rule hero-rule-horizontal" />
      <div class="hero-rule hero-rule-vertical" />
      <div
        class="hero-vignette absolute inset-0"
        :style="{
          background: isDark
            ? 'linear-gradient(to bottom, transparent 0%, transparent 58%, color-mix(in oklch, var(--color-surface-950) 94%, black) 100%)'
            : 'radial-gradient(ellipse at 35% 25%, transparent 0%, transparent 46%, var(--color-surface-50) 100%)',
        }"
      />
    </div>

    <div class="relative z-10 mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
      <div class="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-16">
        <div class="max-w-2xl lg:col-span-7">
          <div
            class="bg-primary-50 dark:bg-primary-950/30 ring-primary-500/20 dark:ring-primary-400/20 text-primary-700 dark:text-primary-300 animate-slide-down mb-7 inline-flex items-center gap-2 rounded-full px-3.5 py-1 text-[13px] font-semibold tracking-wide ring-1"
          >
            <span class="relative flex h-1.5 w-1.5">
              <span
                class="bg-primary-500 absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
              />
              <span class="bg-primary-500 relative inline-flex h-1.5 w-1.5 rounded-full" />
            </span>
            Open source / Vue 3 / Vite+
          </div>

          <h1
            class="animate-fade-in mb-6 text-[2.75rem] leading-[1.1] font-extrabold tracking-tight sm:text-5xl lg:text-[3.5rem] xl:text-6xl"
          >
            Ship
            <span class="text-primary-600 dark:text-primary-400">production&#8209;grade</span> apps,
            <br class="hidden sm:block" />not boilerplate
          </h1>

          <p
            class="text-surface-500 dark:text-surface-400 animate-slide-up mb-9 max-w-lg text-lg leading-relaxed lg:text-xl"
            style="animation-delay: 0.08s"
          >
            {{ t('hero_desc') }}
          </p>

          <div class="animate-slide-up mb-12 flex flex-wrap gap-3" style="animation-delay: 0.16s">
            <RouterLink
              to="/docs/components/overview"
              class="group bg-primary-500 hover:bg-primary-600 focus-visible:ring-primary-300/30 dark:focus-visible:ring-offset-surface-900 text-surface-50 relative inline-flex min-h-11 items-center gap-2.5 rounded-lg px-7 py-3 font-semibold shadow-(--shadow-soft) transition-all duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <span
                :class="[
                  resolveIcon('widget'),
                  'h-5 w-5 transition-transform group-hover:rotate-12',
                ]"
              />
              {{ t('hero_explore') }}
            </RouterLink>
            <RouterLink
              to="/dashboard"
              class="group border-surface-200 bg-surface-50 text-surface-700 hover:border-primary-300 hover:bg-surface-100 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-200 dark:hover:border-primary-700 dark:hover:bg-surface-800 focus-visible:ring-primary-300/30 dark:focus-visible:ring-offset-surface-900 inline-flex min-h-11 items-center gap-2.5 rounded-lg border px-7 py-3 font-semibold transition-all duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <span
                :class="[
                  resolveIcon('chart'),
                  'h-5 w-5 transition-transform group-hover:scale-110',
                ]"
              />
              {{ t('hero_dashboard') }}
            </RouterLink>
          </div>

          <div
            class="text-surface-500 dark:text-surface-400 animate-slide-up flex flex-wrap gap-x-5 gap-y-2 text-[13px]"
            style="animation-delay: 0.24s"
          >
            <span v-for="s in stackItems" :key="s.label" class="inline-flex items-center gap-1.5">
              <span :class="[s.icon, 'h-4 w-4 shrink-0']" />
              <span class="text-surface-700 dark:text-surface-300 font-medium">{{ s.label }}</span>
            </span>
          </div>
        </div>

        <div class="hidden justify-center lg:col-span-5 lg:flex">
          <HeroCodePreview :mouse-x="mouseX" :mouse-y="mouseY" />
        </div>
      </div>
    </div>

    <div class="bg-surface-200/70 absolute right-0 bottom-0 left-0 h-px dark:bg-transparent" />
  </section>
</template>

<style scoped>
.hero-dots {
  background-image:
    linear-gradient(
      color-mix(in oklch, var(--color-primary-500) 10%, transparent) 1px,
      transparent 1px
    ),
    linear-gradient(
      90deg,
      color-mix(in oklch, var(--color-primary-500) 10%, transparent) 1px,
      transparent 1px
    );
  background-size: 32px 32px;
  mask-image: linear-gradient(to bottom, black 0%, black 64%, transparent 96%);
  -webkit-mask-image: linear-gradient(to bottom, black 0%, black 64%, transparent 96%);
}

:global(.dark) .hero-dots {
  background-image:
    linear-gradient(
      color-mix(in oklch, var(--color-surface-400) 9%, transparent) 1px,
      transparent 1px
    ),
    linear-gradient(
      90deg,
      color-mix(in oklch, var(--color-surface-400) 9%, transparent) 1px,
      transparent 1px
    );
}

.hero-rule {
  position: absolute;
  background: color-mix(in oklch, var(--color-primary-500) 26%, transparent);
}

.hero-rule-horizontal {
  inset-inline: 0;
  top: 18%;
  height: 1px;
}

.hero-rule-vertical {
  inset-block: 0;
  inset-inline-start: 62%;
  width: 1px;
}
</style>
