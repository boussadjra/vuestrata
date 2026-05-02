<script setup lang="ts">
import { useI18n } from 'vue-i18n'

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
const mouseX = ref(0)
const mouseY = ref(0)

function handleMouseMove(e: MouseEvent) {
  const { innerWidth, innerHeight } = window
  mouseX.value = (e.clientX / innerWidth - 0.5) * 14
  mouseY.value = (e.clientY / innerHeight - 0.5) * 14
}

onMounted(() => window.addEventListener('mousemove', handleMouseMove))
onUnmounted(() => window.removeEventListener('mousemove', handleMouseMove))
</script>

<template>
  <section class="relative flex min-h-screen items-center overflow-hidden">
    <div class="pointer-events-none absolute inset-0 select-none" aria-hidden="true">
      <div class="hero-dots absolute inset-0" />
      <div
        class="bg-primary-400/20 dark:bg-primary-500/10 animate-float absolute -top-32 -right-32 h-170 w-170 rounded-full blur-[140px]"
      />
      <div
        class="bg-accent-400/15 dark:bg-accent-500/8 animate-float absolute -bottom-40 -left-20 h-130 w-130 rounded-full blur-[120px]"
        style="animation-delay: -4s"
      />
      <div
        class="bg-secondary-300/10 dark:bg-secondary-500/5 animate-float absolute top-1/3 left-1/2 h-95 w-95 rounded-full blur-[100px]"
        style="animation-delay: -2s"
      />
      <div
        class="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,var(--color-surface-50)_100%)] dark:bg-[radial-gradient(ellipse_at_center,transparent_40%,var(--color-surface-950)_100%)]"
      />
    </div>

    <div class="relative z-10 mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
      <div class="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-16">
        <div class="max-w-2xl lg:col-span-7">
          <div
            class="bg-primary-500/8 dark:bg-primary-400/10 ring-primary-500/20 dark:ring-primary-400/20 text-primary-600 dark:text-primary-400 animate-slide-down mb-7 inline-flex items-center gap-2 rounded-full px-3.5 py-1 text-[13px] font-semibold tracking-wide ring-1"
          >
            <span class="relative flex h-1.5 w-1.5">
              <span
                class="bg-primary-500 absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
              />
              <span class="bg-primary-500 relative inline-flex h-1.5 w-1.5 rounded-full" />
            </span>
            Open-source&ensp;·&ensp;Vue 3&ensp;·&ensp;TypeScript
          </div>

          <h1
            class="animate-fade-in mb-6 text-[2.75rem] leading-[1.1] font-extrabold tracking-tight sm:text-5xl lg:text-[3.5rem] xl:text-6xl"
          >
            Ship <span class="hero-gradient-text">production&#8209;grade</span> apps,
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
              class="group from-primary-600 to-primary-500 shadow-primary-500/40 hover:shadow-primary-500/50 relative inline-flex items-center gap-2.5 rounded-xl bg-linear-to-r px-7 py-3 font-semibold text-white shadow-[0_2px_24px_-4px] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_32px_-4px] active:translate-y-0"
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
              class="group border-surface-200 dark:border-surface-700 dark:bg-surface-800/60 text-surface-700 dark:text-surface-200 hover:border-primary-300 dark:hover:border-primary-700 dark:hover:bg-surface-800 inline-flex items-center gap-2.5 rounded-xl border bg-white/60 px-7 py-3 font-semibold backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-white active:translate-y-0"
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

    <div
      class="via-surface-200 dark:via-surface-800 absolute right-0 bottom-0 left-0 h-px bg-linear-to-r from-transparent to-transparent"
    />
  </section>
</template>

<style scoped>
.hero-dots {
  background-image: radial-gradient(circle, rgb(20 184 166 / 0.12) 1px, transparent 1px);
  background-size: 28px 28px;
  mask-image: radial-gradient(ellipse 70% 60% at 50% 50%, black 30%, transparent 80%);
  -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 50%, black 30%, transparent 80%);
}

:global(html.dark) .hero-dots {
  background-image: radial-gradient(circle, rgb(148 163 184 / 0.08) 1px, transparent 1px);
}

.hero-gradient-text {
  background: linear-gradient(
    135deg,
    var(--color-primary-500),
    var(--color-accent-500),
    var(--color-secondary-500)
  );
  background-size: 200% auto;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: gradient-shift 6s ease-in-out infinite;
}

@keyframes gradient-shift {
  0%,
  100% {
    background-position: 0% center;
  }

  50% {
    background-position: 100% center;
  }
}
</style>
