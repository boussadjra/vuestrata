<script setup lang="ts">
import { resolveIcon } from '~/config/icon-provider'
import type { IconName } from '~/types'

export interface AlertProps {
  provider?: 'reka'
  variant?: 'info' | 'success' | 'warning' | 'error'
  title?: string
  dismissible?: boolean
  icon?: boolean
  /**
   * Accessible name for the dismiss button. Overridable because this is a UI
   * primitive with no i18n of its own — a hardcoded English label is the only
   * thing an Arabic or French screen-reader user would hear here.
   */
  dismissLabel?: string
}

const props = withDefaults(defineProps<AlertProps>(), {
  provider: 'reka',
  variant: 'info',
  dismissible: false,
  icon: true,
  dismissLabel: 'Dismiss',
})

const emit = defineEmits<{ dismiss: [] }>()

const visible = ref(true)

/**
 * Variant styling, expressed in semantic tokens.
 *
 * Each variant used to carry four hardcoded raw-palette pairs (a light shade
 * plus a hand-written dark twin) — 28 such utilities in this file alone. That meant
 * the alert looked identical on all ten themes and needed its light/dark
 * inversion written out by hand for every colour.
 *
 * `*-subtle` backgrounds and the foreground/border steps re-point themselves in
 * dark mode via the single `:root.dark` block in styles/semantic.css, so there
 * is no `dark:` variant here at all.
 */
const variantConfig: Record<
  NonNullable<AlertProps['variant']>,
  {
    bg: string
    border: string
    iconName: IconName
    iconColor: string
    text: string
    role: 'alert' | 'status'
  }
> = {
  info: {
    bg: 'bg-info-subtle',
    border: 'border-info-200 dark:border-info-800',
    iconName: 'info-circle',
    // Non-urgent: 'status' is announced politely, without interrupting.
    role: 'status',
    iconColor: 'text-info-600 dark:text-info-400',
    text: 'text-info-900 dark:text-info-100',
  },
  success: {
    bg: 'bg-success-subtle',
    border: 'border-success-200 dark:border-success-800',
    iconName: 'check-circle',
    role: 'status',
    iconColor: 'text-success-600 dark:text-success-400',
    text: 'text-success-900 dark:text-success-100',
  },
  warning: {
    bg: 'bg-warning-subtle',
    border: 'border-warning-200 dark:border-warning-800',
    iconName: 'danger-triangle',
    // Urgent: 'alert' interrupts the screen reader, which is warranted here.
    role: 'alert',
    iconColor: 'text-warning-600 dark:text-warning-400',
    text: 'text-warning-900 dark:text-warning-100',
  },
  error: {
    bg: 'bg-destructive-subtle',
    border: 'border-danger-200 dark:border-danger-800',
    iconName: 'close-circle',
    role: 'alert',
    iconColor: 'text-danger-600 dark:text-danger-400',
    text: 'text-danger-900 dark:text-danger-100',
  },
}

const config = computed(() => variantConfig[props.variant]!)

function dismiss() {
  visible.value = false
  emit('dismiss')
}
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-200 ease-out"
    leave-active-class="transition-all duration-150 ease-in"
    enter-from-class="opacity-0 -translate-y-1"
    leave-to-class="opacity-0 -translate-y-1"
  >
    <div
      v-if="visible"
      :class="[
        'flex items-start gap-3 rounded-lg border p-4',
        config.bg,
        config.border,
        config.text,
      ]"
      :role="config.role"
      data-ui="alert"
      :data-provider="provider"
    >
      <span
        v-if="icon"
        :class="[resolveIcon(config.iconName), config.iconColor, 'mt-0.5 h-5 w-5 shrink-0']"
        aria-hidden="true"
      />
      <div class="min-w-0 flex-1">
        <p v-if="title" class="mb-1 text-sm font-semibold">{{ title }}</p>
        <div class="text-sm">
          <slot />
        </div>
      </div>
      <button
        v-if="dismissible"
        type="button"
        class="shrink-0 rounded-md p-1 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
        :aria-label="dismissLabel"
        @click="dismiss"
      >
        <span :class="[resolveIcon('close'), 'h-4 w-4']" aria-hidden="true" />
      </button>
    </div>
  </Transition>
</template>
