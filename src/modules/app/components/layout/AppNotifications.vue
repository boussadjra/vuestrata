<script setup lang="ts">
import { UiButton } from '@/components/ui'
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
  info: 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/50',
  success: 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950/50',
  warning: 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/50',
  error: 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950/50',
}

const variantLive: Record<string, 'polite' | 'assertive'> = {
  info: 'polite',
  success: 'polite',
  warning: 'assertive',
  error: 'assertive',
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2"
      role="region"
      aria-label="Notifications"
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
            'shadow-elevated flex items-start gap-3 rounded-lg border p-4',
            variantColor[n.type],
          ]"
          role="alert"
          :aria-live="variantLive[n.type] ?? 'polite'"
        >
          <span
            :class="[
              resolveIcon(variantIconName[n.type] ?? 'info-circle'),
              'mt-0.5 h-5 w-5 shrink-0',
            ]"
          />
          <div class="min-w-0 flex-1">
            <p v-if="n.title" class="text-surface-900 dark:text-surface-50 text-sm font-semibold">
              {{ n.title }}
            </p>
            <p class="text-surface-600 dark:text-surface-400 text-sm">{{ n.message }}</p>
          </div>
          <UiButton
            variant="ghost"
            size="sm"
            icon
            class="-me-1 -mt-0.5 shrink-0"
            aria-label="Dismiss"
            @click="notificationStore.remove(n.id)"
          >
            <span :class="[resolveIcon('close'), 'h-3.5 w-3.5']" />
          </UiButton>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
