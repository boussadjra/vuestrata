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
  <section
    class="border-surface-200 dark:border-surface-800 bg-surface-100/70 dark:bg-surface-900 relative overflow-hidden border-y"
  >
    <div
      class="mx-auto grid max-w-7xl gap-8 px-5 py-14 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:py-16"
    >
      <div>
        <p
          class="text-primary-600 dark:text-primary-400 mb-3 text-sm font-semibold tracking-wide uppercase"
        >
          Stack contract
        </p>
        <h2 class="text-surface-900 dark:text-surface-50 text-2xl font-bold tracking-tight">
          One starter, one toolchain, replaceable layers.
        </h2>
      </div>

      <dl
        class="border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-950 grid overflow-hidden rounded-xl border sm:grid-cols-2 lg:grid-cols-3"
      >
        <div
          v-for="(stackItem, stackIndex) in stackItems"
          :key="stackItem.label"
          class="border-surface-200/80 dark:border-surface-800 animate-scale-in flex items-start gap-3 border-b p-4 sm:odd:border-e lg:[&:nth-child(3n)]:border-e-0 lg:[&:nth-child(3n+1)]:border-e lg:[&:nth-child(3n+2)]:border-e lg:[&:nth-last-child(-n+3)]:border-b-0"
          :style="{ animationDelay: `${0.05 + stackIndex * 0.06}s` }"
        >
          <span
            :class="[
              stackItem.icon,
              'text-surface-600 dark:text-surface-300 mt-0.5 h-6 w-6 shrink-0',
            ]"
          />
          <div>
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
