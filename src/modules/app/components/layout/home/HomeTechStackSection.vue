<script setup lang="ts">
type StackItem = {
  icon: string
  label: string
  desc: string
}

defineProps<{
  stackItems: StackItem[]
}>()
</script>

<template>
  <section class="relative overflow-hidden py-20 lg:py-24">
    <div
      class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_oklch,var(--color-secondary-500)_10%,transparent),transparent_38%)]"
      aria-hidden="true"
    />

    <div
      class="mx-auto grid max-w-7xl gap-8 px-5 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center"
    >
      <div class="max-w-md">
        <p
          class="text-primary-600 dark:text-primary-400 mb-3 text-sm font-semibold tracking-wide uppercase"
        >
          Stack contract
        </p>
        <h2 class="text-surface-900 dark:text-surface-50 text-2xl font-bold tracking-tight">
          One starter, one toolchain, replaceable layers.
        </h2>

        <p class="text-surface-500 dark:text-surface-400 mt-4 text-base leading-7">
          The same tokens and conventions carry from theme switching to provider adapters, typed
          queries, and test infrastructure.
        </p>
      </div>

      <dl
        class="border-surface-200/80 bg-surface-50/88 dark:border-surface-800 dark:bg-surface-900/82 grid overflow-hidden rounded-[calc(var(--shape-radius)+0.375rem)] border shadow-(--shadow-card) sm:grid-cols-2 lg:grid-cols-3"
      >
        <div
          v-for="(stackItem, stackIndex) in stackItems"
          :key="stackItem.label"
          class="border-surface-200/80 dark:border-surface-800 animate-scale-in bg-surface-50/60 flex items-start gap-3 border-b p-4 sm:odd:border-e lg:nth-[3n]:border-e-0 lg:nth-[3n+1]:border-e lg:nth-[3n+2]:border-e lg:nth-last-[-n+3]:border-b-0 dark:bg-transparent"
          :style="{ animationDelay: `${0.05 + stackIndex * 0.06}s` }"
        >
          <span
            class="border-surface-200 bg-surface-50 text-surface-700 dark:border-surface-700 dark:bg-surface-950 dark:text-surface-200 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border"
          >
            <span :class="[stackItem.icon, 'h-5 w-5']" />
          </span>
          <div class="min-w-0">
            <dt class="text-surface-800 dark:text-surface-100 text-sm font-semibold">
              {{ stackItem.label }}
            </dt>
            <dd class="text-surface-500 dark:text-surface-400 mt-0.5 text-xs leading-5">
              {{ stackItem.desc }}
            </dd>
          </div>
        </div>
      </dl>
    </div>
  </section>
</template>
