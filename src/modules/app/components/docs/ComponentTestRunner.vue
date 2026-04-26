<script setup lang="ts">
import type { AxeResults } from 'axe-core'

const target = useTemplateRef<HTMLElement>('target')
const results = ref<AxeResults | null>(null)
const running = ref(false)
const error = ref('')

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

function impactColor(impact?: string) {
  switch (impact) {
    case 'critical':
      return 'text-red-600 dark:text-red-400'
    case 'serious':
      return 'text-orange-600 dark:text-orange-400'
    case 'moderate':
      return 'text-yellow-600 dark:text-yellow-400'
    case 'minor':
      return 'text-blue-600 dark:text-blue-400'
    default:
      return 'text-surface-500'
  }
}

function impactBadge(impact?: string | null) {
  switch (impact) {
    case 'critical':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    case 'serious':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
    case 'moderate':
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
    case 'minor':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
    default:
      return 'bg-surface-100 text-surface-600'
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
    <div ref="target" class="dark:bg-surface-900 bg-white p-6">
      <slot />
    </div>

    <!-- Results -->
    <div
      v-if="error"
      class="border-surface-200 dark:border-surface-700/60 border-t bg-red-50 px-4 py-3 dark:bg-red-950/20"
    >
      <p class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>
    </div>

    <div v-else-if="results" class="border-surface-200 dark:border-surface-700/60 border-t">
      <!-- Summary -->
      <div class="bg-surface-50 dark:bg-surface-800/30 flex flex-wrap gap-4 px-4 py-3 text-xs">
        <span class="flex items-center gap-1.5">
          <span class="size-2 rounded-full bg-green-500" />
          <span class="font-medium">{{ results.passes.length }}</span> passed
        </span>
        <span class="flex items-center gap-1.5">
          <span class="size-2 rounded-full bg-red-500" />
          <span class="font-medium">{{ results.violations.length }}</span> violations
        </span>
        <span class="flex items-center gap-1.5">
          <span class="size-2 rounded-full bg-yellow-500" />
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
          <p class="text-surface-500 dark:text-surface-400 text-xs">{{ v.description }}</p>
          <p class="text-surface-400 font-mono text-xs">{{ v.helpUrl }}</p>
        </div>
      </div>

      <!-- All passed -->
      <div v-else class="px-4 py-6 text-center">
        <p class="text-sm font-medium text-green-600 dark:text-green-400">
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
      <p class="text-surface-400 text-xs">
        Click "Run Audit" to check WCAG 2.0 A/AA compliance and best practices
      </p>
    </div>
  </div>
</template>
