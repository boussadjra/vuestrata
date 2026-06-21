<script setup lang="ts">
import { resolveIcon } from '~/config/icon-provider'
import type { IconName } from '~/types'

export interface BaseAlertProps {
  provider: 'reka'
  variant?: 'info' | 'success' | 'warning' | 'error'
  title?: string
  dismissible?: boolean
  icon?: boolean
}

const props = withDefaults(defineProps<BaseAlertProps>(), {
  variant: 'info',
  dismissible: false,
  icon: true,
})

const emit = defineEmits<{ dismiss: [] }>()

const visible = ref(true)

const variantConfig: Record<
  string,
  { bg: string; border: string; iconName: IconName; iconColor: string; text: string }
> = {
  info: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-200 dark:border-blue-800',
    iconName: 'info-circle',
    iconColor: 'text-blue-500',
    text: 'text-blue-800 dark:text-blue-200',
  },
  success: {
    bg: 'bg-green-50 dark:bg-green-950/30',
    border: 'border-green-200 dark:border-green-800',
    iconName: 'check-circle',
    iconColor: 'text-green-500',
    text: 'text-green-800 dark:text-green-200',
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-800',
    iconName: 'danger-triangle',
    iconColor: 'text-amber-500',
    text: 'text-amber-800 dark:text-amber-200',
  },
  error: {
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200 dark:border-red-800',
    iconName: 'close-circle',
    iconColor: 'text-red-500',
    text: 'text-red-800 dark:text-red-200',
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
      role="alert"
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
        class="shrink-0 rounded-md p-1 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
        aria-label="Dismiss"
        @click="dismiss"
      >
        <span :class="[resolveIcon('close'), 'h-4 w-4']" />
      </button>
    </div>
  </Transition>
</template>
