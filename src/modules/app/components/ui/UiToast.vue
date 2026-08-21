<script setup lang="ts">
import { resolveIcon } from '~/config/icon-provider'

export interface ToastNotification {
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message: string
  duration: number
}

export interface ToastProps {
  provider?: 'reka'
  title?: string
  message: string
  variant?: 'info' | 'success' | 'warning' | 'error'
  duration?: number
  triggerLabel?: string
}

const props = withDefaults(defineProps<ToastProps>(), {
  provider: 'reka',
  title: 'Notification',
  variant: 'info',
  duration: 3500,
  triggerLabel: 'Show toast',
})

/**
 * The trigger reports; it does not deliver.
 *
 * This component used to call `useNotificationStore().add()` itself, which
 * made a `Ui*` wrapper depend on an application store — the one import the
 * component layer cannot have if it is to stay independently upgradable, since
 * a project that renames or replaces its notification store would have to fork
 * the component to keep this button working.
 */
const emit = defineEmits<{ show: [notification: ToastNotification] }>()

function showToast() {
  emit('show', {
    type: props.variant,
    title: props.title,
    message: props.message,
    duration: props.duration,
  })
}
</script>

<template>
  <button
    type="button"
    class="btn border-surface-300 hover:bg-surface-100 dark:border-surface-700 dark:hover:bg-surface-800 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
    data-ui="toast"
    :data-provider="provider"
    @click="showToast"
  >
    <span :class="[resolveIcon('bell'), 'h-4 w-4']" />
    {{ triggerLabel }}
  </button>
</template>
