<script setup lang="ts">
import type { AxeResults } from 'axe-core'

const target = useTemplateRef<HTMLElement>('target')
const results = ref<AxeResults | null>(null)
const running = ref(false)
const error = ref('')

const summaryDotClass = {
  passed: 'bg-accent-500',
  violations: 'bg-danger-500',
  incomplete: 'bg-secondary-500',
} as const

async function runAudit() {
  if (!target.value) return
  running.value = true
  error.value = ''
  results.value = null
  try {
    // Lazy-import axe so the ~250 KB engine is only fetched when a user
    // actually runs the audit (and lives in its own chunk rather than the
    // initial bundle).
    const { default: axe } = await import('axe-core')
    const axeResult = await axe.run(target.value, {
      runOnly: ['wcag2a', 'wcag2aa', 'best-practice'],
    })
    results.value = axeResult
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Audit failed'
  } finally {
    running.value = false
  }
}

function impactBadge(impact?: string | null) {
  switch (impact) {
    case 'critical':
      return 'bg-danger-100 text-danger-700 dark:bg-danger-950/35 dark:text-danger-300'
    case 'serious':
      return 'bg-danger-50 text-danger-700 dark:bg-danger-950/20 dark:text-danger-300'
    case 'moderate':
      return 'bg-secondary-100 text-secondary-700 dark:bg-secondary-950/35 dark:text-secondary-300'
    case 'minor':
      return 'bg-primary-100 text-primary-700 dark:bg-primary-950/35 dark:text-primary-300'
    default:
      return 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-300'
  }
}
</script>

<template>
  <div class="border-surface-200 dark:border-surface-700/60 overflow-hidden rounded-xl border">
    <div
      class="border-surface-200 dark:border-surface-700/60 bg-surface-50 dark:bg-surface-800/50 flex items-center justify-between border-b px-4 py-2"
    >
      <span
        class="text-primary-600 dark:text-primary-400 text-xs font-semibold tracking-wider uppercase"
        >Accessibility Audit</span
      >
      <UiButton size="xs" :loading="running" @click="runAudit">
        {{ running ? 'Running…' : 'Run Audit' }}
      </UiButton>
    </div>

    <!-- Target component -->
    <div ref="target" class="bg-surface-50 dark:bg-surface-900 p-6">
      <slot />
    </div>

    <!-- Results -->
    <div
      v-if="error"
      class="border-surface-200 dark:border-surface-700/60 bg-danger-50/70 dark:bg-danger-950/20 border-t px-4 py-3"
    >
      <p class="text-danger-700 dark:text-danger-300 text-sm">{{ error }}</p>
    </div>

    <div v-else-if="results" class="border-surface-200 dark:border-surface-700/60 border-t">
      <!-- Summary -->
      <div class="bg-surface-50 dark:bg-surface-800/30 flex flex-wrap gap-4 px-4 py-3 text-xs">
        <span class="flex items-center gap-1.5">
          <span :class="['size-2 rounded-full', summaryDotClass.passed]" />
          <span class="font-medium">{{ results.passes.length }}</span> passed
        </span>
        <span class="flex items-center gap-1.5">
          <span :class="['size-2 rounded-full', summaryDotClass.violations]" />
          <span class="font-medium">{{ results.violations.length }}</span> violations
        </span>
        <span class="flex items-center gap-1.5">
          <span :class="['size-2 rounded-full', summaryDotClass.incomplete]" />
          <span class="font-medium">{{ results.incomplete.length }}</span> incomplete
        </span>
      </div>

      <!-- Violations -->
      <div
        v-if="results.violations.length"
        class="divide-surface-200 dark:divide-surface-700/60 divide-y"
      >
        <div v-for="v in results.violations" :key="v.id" class="space-y-1 px-4 py-3">
          <div class="flex items-center gap-2">
            <span
              :class="[
                'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                impactBadge(v.impact),
              ]"
              >{{ v.impact }}</span
            >
            <span class="text-sm font-medium">{{ v.id }}</span>
          </div>
          <p class="text-muted-foreground text-xs">{{ v.description }}</p>
          <p class="text-muted-foreground font-mono text-xs">{{ v.helpUrl }}</p>
        </div>
      </div>

      <!-- All passed -->
      <div v-else class="px-4 py-6 text-center">
        <p class="text-accent-600 dark:text-accent-300 text-sm font-medium">
          All accessibility checks passed!
        </p>
        <p class="text-surface-500 mt-1 text-xs">
          {{ results.passes.length }} rules verified against WCAG 2.0 A/AA + best practices
        </p>
      </div>
    </div>

    <!-- Idle state -->
    <div
      v-else
      class="border-surface-200 dark:border-surface-700/60 border-t px-4 py-4 text-center"
    >
      <p class="text-muted-foreground text-xs">
        Click "Run Audit" to check WCAG 2.0 A/AA compliance and best practices
      </p>
    </div>
  </div>
</template>
