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
    class="border-surface-200 dark:border-surface-800 dark:bg-surface-900 relative overflow-hidden border-y bg-white"
  >
    <div class="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:py-16">
      <p
        class="text-primary-500 dark:text-primary-400 mb-8 text-center text-sm font-semibold tracking-widest uppercase"
      >
        Built with
      </p>
      <div class="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
        <div
          v-for="(s, i) in stackItems"
          :key="s.label"
          class="hover:bg-surface-50 dark:hover:bg-surface-800/60 animate-scale-in flex flex-col items-center gap-2 rounded-xl py-4 transition-colors duration-200"
          :style="{ animationDelay: `${0.05 + i * 0.06}s` }"
        >
          <span :class="[s.icon, 'text-surface-600 dark:text-surface-300 h-8 w-8']" />
          <span class="text-surface-800 dark:text-surface-200 text-sm font-semibold">{{
            s.label
          }}</span>
          <span class="text-surface-400 dark:text-surface-500 text-xs">{{ s.desc }}</span>
        </div>
      </div>
    </div>
  </section>
</template>
