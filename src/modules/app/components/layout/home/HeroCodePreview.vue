<script setup lang="ts">
defineProps<{
  mouseX: number
  mouseY: number
}>()
</script>

<template>
  <div
    dir="ltr"
    class="terminal-wrapper animate-scale-in"
    aria-label="Vuestrata app shell code preview"
    :style="{
      transform: `perspective(1400px) rotateY(${mouseX * 0.25}deg) rotateX(${-mouseY * 0.25}deg)`,
    }"
  >
    <div
      class="terminal border-surface-200/80 bg-surface-50 dark:border-surface-700/70 dark:bg-surface-900 relative w-105 overflow-hidden rounded-xl border shadow-(--shadow-elevated)"
    >
      <div
        class="border-surface-200 dark:border-surface-800 flex items-center gap-2 border-b px-4 py-3"
      >
        <div class="flex gap-1.5">
          <span class="bg-surface-300/80 dark:bg-surface-600/60 h-3 w-3 rounded-full" />
          <span class="bg-surface-300/80 dark:bg-surface-600/60 h-3 w-3 rounded-full" />
          <span class="bg-surface-300/80 dark:bg-surface-600/60 h-3 w-3 rounded-full" />
        </div>
        <div class="flex flex-1 justify-center">
          <span class="text-muted-foreground text-[11px] font-medium tracking-wide">App.vue</span>
        </div>
        <div class="w-12" />
      </div>

      <div class="overflow-hidden px-5 py-4 font-mono text-[12.5px] leading-[1.75] select-none">
        <div class="code-line" style="animation-delay: 0.5s">
          <span class="ln">1</span><span class="tok-tag">&lt;script</span>
          <span class="tok-attr">setup</span> <span class="tok-attr">lang</span>=<span
            class="tok-str"
            >"ts"</span
          ><span class="tok-tag">&gt;</span>
        </div>
        <div class="code-line" style="animation-delay: 0.58s">
          <span class="ln">2</span
          ><span class="pl1"
            ><span class="tok-key">import</span> { <span class="tok-fn">useThemeSync</span> }
            <span class="tok-key">from</span>
            <span class="tok-str">'@/composables/useTheme'</span></span
          >
        </div>
        <div class="code-line" style="animation-delay: 0.66s">
          <span class="ln">3</span>
        </div>
        <div class="code-line" style="animation-delay: 0.74s">
          <span class="ln">4</span
          ><span class="pl1"><span class="tok-fn">useThemeSync</span>()</span>
        </div>
        <div class="code-line" style="animation-delay: 0.82s">
          <span class="ln">5</span><span class="tok-tag">&lt;/script&gt;</span>
        </div>
        <div class="code-line" style="animation-delay: 0.9s">
          <span class="ln">6</span>
        </div>
        <div class="code-line" style="animation-delay: 0.98s">
          <span class="ln">7</span><span class="tok-tag">&lt;template&gt;</span>
        </div>
        <div class="code-line" style="animation-delay: 1.06s">
          <span class="ln">8</span
          ><span class="pl1"><span class="tok-tag">&lt;Suspense&gt;</span></span>
        </div>
        <div class="code-line" style="animation-delay: 1.14s">
          <span class="ln">9</span
          ><span class="pl2"
            ><span class="tok-tag">&lt;RouterView</span> <span class="tok-tag">/&gt;</span></span
          >
        </div>
        <div class="code-line" style="animation-delay: 1.22s">
          <span class="ln">10</span
          ><span class="pl1"><span class="tok-tag">&lt;/Suspense&gt;</span></span>
        </div>
        <div class="code-line" style="animation-delay: 1.3s">
          <span class="ln">11</span><span class="tok-tag">&lt;/template&gt;</span>
        </div>
      </div>

      <!--
        Opaque `bg-muted` rather than a translucent tint: a semi-transparent
        background composites against whatever is behind it, so the effective
        contrast of the 10px label text is not knowable from the declared
        colours — and here it landed below AA.
      -->
      <dl
        class="border-border bg-muted text-foreground grid grid-cols-3 border-t px-4 py-3 text-[10px] font-semibold tracking-wide uppercase"
      >
        <div>
          <dt>Provider</dt>
          <dd class="text-foreground mt-1 font-mono normal-case">Reka UI</dd>
        </div>
        <div>
          <dt>Theme</dt>
          <dd class="text-foreground mt-1 font-mono normal-case">Default</dd>
        </div>
        <div>
          <dt>Checks</dt>
          <dd class="text-primary-700 dark:text-primary-300 mt-1 font-mono normal-case">
            vp check
          </dd>
        </div>
      </dl>
    </div>
  </div>
</template>

<style scoped>
.terminal-wrapper {
  position: relative;
  transition: transform 150ms cubic-bezier(0.16, 1, 0.3, 1);
  will-change: transform;
}

.terminal-wrapper div {
  direction: ltr;
  /* `dir="ltr"` fixes character order, but `text-align` is a separate,
     inherited property — in RTL the page's `[dir='rtl'] { text-align: right }`
     still cascades in and right-aligns any wrapped line inside a flex item
     (the import statement is the only line long enough to wrap). */
  text-align: left;
}

.code-line {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  min-height: 1.5rem;
  opacity: 0;
  animation: code-appear 350ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.ln {
  display: inline-block;
  width: 1.5rem;
  text-align: right;
  /* `surface-400` measured 2.45:1 here — this is 10.4px text, so it needs 4.5:1.
     `muted-foreground` is the token built for de-emphasised text and is defined
     to clear AA on every surface it lands on, in both colour modes. */
  color: var(--color-muted-foreground);
  font-size: 0.65rem;
  user-select: none;
  flex-shrink: 0;
}

.pl1 {
  padding-inline-start: 1.25rem;
}

.pl2 {
  padding-inline-start: 2.5rem;
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

/*
 * `html.dark .tok-*`, NOT `:global(html.dark) .tok-*`.
 *
 * Scoped styles append `[data-v-…]` to the last compound only, so an ancestor
 * that lives outside the component already works unwrapped. Wrapping the
 * ancestor in `:global()` made the compiler emit `html.dark { color: … }` —
 * the `.tok-*` descendant was dropped entirely, so none of these six rules
 * ever applied and each one instead set a colour on <html>. It went unnoticed
 * because every theme's primary-600 was merely darker than intended on the
 * preview card, rather than illegible.
 */
.tok-tag {
  color: var(--color-primary-600);
}

html.dark .tok-tag {
  color: var(--color-primary-400);
}

.tok-attr {
  color: var(--color-accent-700);
}

html.dark .tok-attr {
  color: var(--color-accent-400);
}

.tok-str {
  color: var(--color-secondary-700);
}

html.dark .tok-str {
  color: var(--color-secondary-300);
}

.tok-key {
  color: var(--color-primary-700);
}

html.dark .tok-key {
  color: var(--color-primary-400);
}

.tok-fn {
  color: var(--color-accent-700);
}

html.dark .tok-fn {
  color: var(--color-accent-400);
}

.tok-var {
  color: var(--color-surface-800);
}

html.dark .tok-var {
  color: var(--color-surface-200);
}

@media (prefers-reduced-motion: reduce) {
  .terminal-wrapper {
    transition: none;
  }

  .code-line {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
</style>
