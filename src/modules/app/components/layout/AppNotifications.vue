<script setup lang="ts">
import { resolveIcon } from '@/config/icon-provider'
import { useNotificationStore } from '@/stores/notification'
import type { IconName } from '@/types'

const notificationStore = useNotificationStore()

const variantIconName: Record<string, IconName> = {
  info: 'info-circle',
  success: 'check-circle',
  warning: 'danger-triangle',
  error: 'close-circle',
}

const variantColor: Record<string, string> = {
  info: 'border-blue-400 bg-blue-50 dark:bg-blue-950/40',
  success: 'border-green-400 bg-green-50 dark:bg-green-950/40',
  warning: 'border-amber-400 bg-amber-50 dark:bg-amber-950/40',
  error: 'border-red-400 bg-red-50 dark:bg-red-950/40',
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      <TransitionGroup
        enter-active-class="transition-all duration-300 ease-out"
        leave-active-class="transition-all duration-200 ease-in"
        enter-from-class="opacity-0 translate-x-4"
        leave-to-class="opacity-0 translate-x-4"
      >
        <div
          v-for="n in notificationStore.notifications"
          :key="n.id"
          :class="[
            'shadow-elevated flex items-start gap-3 rounded-lg border-l-4 p-4',
            'dark:bg-surface-800 bg-white',
            variantColor[n.type],
          ]"
          role="alert"
        >
          <span
            :class="[
              resolveIcon(variantIconName[n.type] ?? 'info-circle'),
              'mt-0.5 h-5 w-5 shrink-0',
            ]"
          />
          <div class="min-w-0 flex-1">
            <p v-if="n.title" class="text-sm font-semibold">{{ n.title }}</p>
            <p class="text-surface-600 dark:text-surface-400 text-sm">{{ n.message }}</p>
          </div>
          <button
            class="shrink-0 rounded p-1 hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Dismiss"
            @click="notificationStore.remove(n.id)"
          >
            <span :class="[resolveIcon('close'), 'h-3.5 w-3.5']" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
