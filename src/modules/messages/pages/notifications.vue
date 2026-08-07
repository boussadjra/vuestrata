<script setup lang="ts">
/**
 * Notification centre.
 *
 * Distinct from messages: a notification is something the system said, not a
 * conversation, so there is nothing to reply to and the useful actions are
 * "go to what this is about" and "stop showing me this".
 */
import { useI18n } from 'vue-i18n'

import {
  UiBadge,
  UiButton,
  UiCard,
  UiEmptyState,
  UiPageHeader,
  UiSelect,
  UiSkeleton,
} from '@/components/ui'
import { useFormatters } from '@/composables/useFormatters'
import { resolveIcon } from '@/config/icon-provider'
import type { IconName } from '@/types'

import { useNotificationsQuery, useUpdateNotificationMutation } from '../composables/useMessages'
import { NOTIFICATION_KINDS, type NotificationFilters, type NotificationKind } from '../types'

const { t } = useI18n()
const { dateTime, relativeTime } = useFormatters()

const kind = ref<NotificationKind | 'all'>('all')
const readState = ref<'all' | 'true' | 'false'>('all')

const filters = computed<NotificationFilters>(() => ({
  kind: kind.value,
  read: readState.value,
  pageSize: 50,
  sortBy: 'createdAt',
  sortOrder: 'desc',
}))

const { items, isPending, isError, refetch } = useNotificationsQuery(filters)
const updateNotification = useUpdateNotificationMutation()

const unread = computed(() => items.value.filter((notification) => !notification.read))

const kindOptions = computed(() => [
  { label: t('common_all'), value: 'all' },
  ...NOTIFICATION_KINDS.map((value) => ({ label: t(`notifications_kind_${value}`), value })),
])

const readOptions = computed(() => [
  { label: t('common_all'), value: 'all' },
  { label: t('notifications_filter_unread'), value: 'false' },
  { label: t('notifications_filter_read'), value: 'true' },
])

const KIND_ICON: Record<NotificationKind, IconName> = {
  mention: 'letter',
  assignment: 'check-circle',
  system: 'info-circle',
  billing: 'card',
  security: 'shield-warning',
}

const KIND_VARIANT: Record<
  NotificationKind,
  'primary' | 'secondary' | 'default' | 'warning' | 'error'
> = {
  mention: 'primary',
  assignment: 'secondary',
  system: 'default',
  billing: 'warning',
  security: 'error',
}

function markRead(id: string, read: boolean) {
  updateNotification.mutate({ id, patch: { read } })
}

/**
 * Marking all read fires one request per unread notification.
 *
 * A real backend should expose a bulk endpoint; the collection contract
 * deliberately has no "update many" verb, because a partial bulk failure has no
 * good answer and pretending otherwise is worse than n requests against a mock.
 */
function markAllRead() {
  for (const notification of unread.value) {
    updateNotification.mutate({ id: notification.id, patch: { read: true } })
  }
}
</script>

<template>
  <div class="space-y-6">
    <UiPageHeader :title="t('notifications_title')" :description="t('notifications_subtitle')">
      <template #actions>
        <UiSelect
          v-model="kind"
          class="min-w-40"
          :options="kindOptions"
          :aria-label="t('notifications_filter_kind')"
        />
        <UiSelect
          v-model="readState"
          class="min-w-36"
          :options="readOptions"
          :aria-label="t('notifications_filter_state')"
        />
        <UiButton variant="secondary" :disabled="unread.length === 0" @click="markAllRead">
          {{ t('notifications_mark_all_read') }}
        </UiButton>
      </template>
    </UiPageHeader>

    <UiEmptyState
      v-if="isError"
      variant="error"
      :title="t('common_error_title')"
      :description="t('common_error_body')"
    >
      <UiButton variant="ghost" @click="refetch">{{ t('common_retry') }}</UiButton>
    </UiEmptyState>

    <div v-else-if="isPending" class="space-y-3" aria-busy="true" :aria-label="t('common_loading')">
      <UiSkeleton v-for="index in 5" :key="index" class="h-20" />
    </div>

    <UiEmptyState
      v-else-if="items.length === 0"
      icon="bell"
      :title="t('notifications_empty_title')"
      :description="t('notifications_empty_body')"
    />

    <ul v-else class="space-y-3">
      <li v-for="notification in items" :key="notification.id">
        <UiCard
          :class="[
            'flex items-start gap-4 p-4',
            // Unread gets a leading accent bar, but the state is also written
            // out below — the bar alone would be colour-only information.
            notification.read ? '' : 'border-s-primary-solid border-s-4',
          ]"
        >
          <span
            class="bg-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            aria-hidden="true"
          >
            <span
              :class="[resolveIcon(KIND_ICON[notification.kind]), 'text-muted-foreground h-4 w-4']"
            />
          </span>

          <div class="min-w-0 grow">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-foreground text-sm font-medium">{{ notification.title }}</h2>
              <UiBadge :variant="KIND_VARIANT[notification.kind]" size="sm">
                {{ t(`notifications_kind_${notification.kind}`) }}
              </UiBadge>
              <UiBadge v-if="!notification.read" variant="primary" size="sm">
                {{ t('notifications_unread') }}
              </UiBadge>
            </div>

            <p class="text-muted-foreground mt-1 text-sm">{{ notification.body }}</p>

            <div class="mt-2 flex flex-wrap items-center gap-3">
              <time
                :datetime="notification.createdAt"
                :title="dateTime(notification.createdAt)"
                class="text-muted-foreground text-xs"
              >
                {{ relativeTime(notification.createdAt) }}
              </time>
              <RouterLink
                v-if="notification.link"
                :to="notification.link"
                class="text-link hover:text-link-hover text-xs hover:underline"
              >
                {{ t('notifications_open') }}
              </RouterLink>
              <!--
                The label names the notification, so a screen reader moving
                through the list does not hear "Mark as read" eight times with
                no way to tell which is which.
              -->
              <button
                type="button"
                class="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
                :aria-label="
                  notification.read
                    ? t('notifications_mark_unread_of', { title: notification.title })
                    : t('notifications_mark_read_of', { title: notification.title })
                "
                @click="markRead(notification.id, !notification.read)"
              >
                {{
                  notification.read ? t('notifications_mark_unread') : t('notifications_mark_read')
                }}
              </button>
            </div>
          </div>
        </UiCard>
      </li>
    </ul>
  </div>
</template>
