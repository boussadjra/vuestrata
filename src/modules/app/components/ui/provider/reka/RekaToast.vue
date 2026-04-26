<script setup lang="ts">
import { useNotificationStore } from '@/stores/notification'
import { resolveIcon } from '~/config/icon-provider'

export interface ToastProps {
  title?: string
  message: string
  variant?: 'info' | 'success' | 'warning' | 'error'
  duration?: number
  triggerLabel?: string
}

const props = withDefaults(defineProps<ToastProps>(), {
  title: 'Notification',
  variant: 'info',
  duration: 3500,
  triggerLabel: 'Show toast',
})

const notifications = useNotificationStore()

function showToast() {
  notifications.add({
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
    data-provider="reka"
    @click="showToast"
  >
    <span :class="[resolveIcon('bell'), 'h-4 w-4']" />
    {{ triggerLabel }}
  </button>
</template>
