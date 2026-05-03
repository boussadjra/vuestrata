<script setup lang="ts">
import { resolveIcon } from '@/config/icon-provider'

defineProps<{
  mouseX: number
  mouseY: number
}>()
</script>

<template>
  <div
    class="terminal-wrapper animate-scale-in"
    :style="{
      transform: `perspective(1400px) rotateY(${mouseX * 0.25}deg) rotateX(${-mouseY * 0.25}deg)`,
    }"
  >
    <div
      class="terminal border-surface-200/70 dark:border-surface-700/60 dark:bg-surface-900/90 shadow-surface-900/12 dark:shadow-primary-500/8 relative w-105 overflow-hidden rounded-2xl border bg-white/80 shadow-[0_20px_70px_-12px] backdrop-blur-xl"
    >
      <!-- Title bar -->
      <div
        class="border-surface-100 dark:border-surface-800 flex items-center gap-2 border-b px-4 py-3"
      >
        <div class="flex gap-1.5">
          <span class="bg-surface-300/80 dark:bg-surface-600/60 h-3 w-3 rounded-full" />
          <span class="bg-surface-300/80 dark:bg-surface-600/60 h-3 w-3 rounded-full" />
          <span class="bg-surface-300/80 dark:bg-surface-600/60 h-3 w-3 rounded-full" />
        </div>
        <div class="flex flex-1 justify-center">
          <span class="text-surface-400 dark:text-surface-500 text-[11px] font-medium tracking-wide"
            >App.vue</span
          >
        </div>
        <div class="w-12" />
      </div>

      <!-- Code lines -->
      <div class="overflow-hidden px-5 py-4 font-mono text-[12.5px] leading-[1.75] select-none">
        <!-- <script setup lang="ts"> -->
        <div class="code-line" style="animation-delay: 0.5s">
          <span class="ln">1</span><span class="tok-tag">&lt;script</span>
          <span class="tok-attr">setup</span> <span class="tok-attr">lang</span>=<span
            class="tok-str"
            >"ts"</span
          ><span class="tok-tag">&gt;</span>
        </div>
        <!-- import { useThemeSync } from '@/composables/useTheme' -->
        <div class="code-line" style="animation-delay: 0.58s">
          <span class="ln">2</span
          ><span class="pl1"
            ><span class="tok-key">import</span> { <span class="tok-fn">useThemeSync</span> }
            <span class="tok-key">from</span>
            <span class="tok-str">'@/composables/useTheme'</span></span
          >
        </div>
        <!-- (blank) -->
        <div class="code-line" style="animation-delay: 0.66s">
          <span class="ln">3</span>
        </div>
        <!-- useThemeSync() -->
        <div class="code-line" style="animation-delay: 0.74s">
          <span class="ln">4</span
          ><span class="pl1"><span class="tok-fn">useThemeSync</span>()</span>
        </div>
        <!-- </script> -->
        <div class="code-line" style="animation-delay: 0.82s">
          <span class="ln">5</span><span class="tok-tag">&lt;/script&gt;</span>
        </div>
        <!-- (blank) -->
        <div class="code-line" style="animation-delay: 0.9s">
          <span class="ln">6</span>
        </div>
        <!-- <template> -->
        <div class="code-line" style="animation-delay: 0.98s">
          <span class="ln">7</span><span class="tok-tag">&lt;template&gt;</span>
        </div>
        <!-- <Suspense> -->
        <div class="code-line" style="animation-delay: 1.06s">
          <span class="ln">8</span
          ><span class="pl1"><span class="tok-tag">&lt;Suspense&gt;</span></span>
        </div>
        <!-- <RouterView /> -->
        <div class="code-line" style="animation-delay: 1.14s">
          <span class="ln">9</span
          ><span class="pl2"
            ><span class="tok-tag">&lt;RouterView</span> <span class="tok-tag">/&gt;</span></span
          >
        </div>
        <!-- </Suspense> -->
        <div class="code-line" style="animation-delay: 1.22s">
          <span class="ln">10</span
          ><span class="pl1"><span class="tok-tag">&lt;/Suspense&gt;</span></span>
        </div>
        <!-- </template> -->
        <div class="code-line" style="animation-delay: 1.3s">
          <span class="ln">11</span><span class="tok-tag">&lt;/template&gt;</span>
        </div>
      </div>

      <div
        class="from-primary-500/6 pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t to-transparent"
      />
    </div>

    <!-- Floating badges -->
    <div
      aria-hidden="true"
      class="bg-accent-500 shadow-accent-500/30 animate-float absolute -top-4 -right-4 flex h-11 w-11 rotate-6 items-center justify-center rounded-2xl text-white shadow-lg"
    >
      <span :class="[resolveIcon('shield-check'), 'h-5 w-5']" />
    </div>
    <div
      aria-hidden="true"
      class="bg-secondary-500 shadow-secondary-500/30 animate-float absolute -bottom-4 -left-4 flex h-11 w-11 -rotate-6 items-center justify-center rounded-2xl text-white shadow-lg"
      style="animation-delay: -3s"
    >
      <span :class="[resolveIcon('palette'), 'h-5 w-5']" />
    </div>
    <div
      aria-hidden="true"
      class="bg-primary-500 shadow-primary-500/30 animate-float absolute top-1/2 -right-5 flex h-9 w-9 rotate-12 items-center justify-center rounded-xl text-white shadow-lg"
      style="animation-delay: -5s"
    >
      <span :class="[resolveIcon('bolt'), 'h-4 w-4']" />
    </div>
  </div>
</template>

<style scoped>
.terminal-wrapper {
  position: relative;
  transition: transform 0.15s ease-out;
  will-change: transform;
}

.code-line {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  min-height: 1.5rem;
  opacity: 0;
  animation: code-appear 0.35s ease forwards;
}

.ln {
  display: inline-block;
  width: 1.5rem;
  text-align: right;
  color: var(--color-surface-400);
  font-size: 0.65rem;
  user-select: none;
  flex-shrink: 0;
}

.pl1 {
  padding-left: 1.25rem;
}

.pl2 {
  padding-left: 2.5rem;
}

@keyframes code-appear {
  from {
    opacity: 0;
    transform: translateY(4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.tok-tag {
  color: var(--color-primary-600);
}

:global(html.dark) .tok-tag {
  color: var(--color-primary-400);
}

.tok-attr {
  color: var(--color-accent-600);
}

:global(html.dark) .tok-attr {
  color: var(--color-accent-400);
}

.tok-str {
  color: var(--color-secondary-700);
}

:global(html.dark) .tok-str {
  color: var(--color-secondary-300);
}

.tok-key {
  color: var(--color-primary-500);
}

:global(html.dark) .tok-key {
  color: var(--color-primary-400);
}

.tok-fn {
  color: var(--color-accent-600);
}

:global(html.dark) .tok-fn {
  color: var(--color-accent-400);
}

.tok-var {
  color: var(--color-surface-800);
}

:global(html.dark) .tok-var {
  color: var(--color-surface-200);
}
</style>
