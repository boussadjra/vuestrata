<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { UiBadge, UiPanel } from '@/components/ui'
import { useFormatters } from '@/composables/useFormatters'
import { resolveIcon } from '~/config/icon-provider'
import type { IconName } from '~/types'

import type { ActivityFeed } from '../types/dashboard'

const props = defineProps<{
  data: ActivityFeed | undefined
  loading: boolean
  error: boolean
  updating?: boolean
}>()

const emit = defineEmits<{ retry: [] }>()

const { t } = useI18n()
const { currency, dateTime, relativeTime } = useFormatters()

const items = computed(() => props.data?.items ?? [])
const isEmpty = computed(() => items.value.length === 0)

const TYPE_ICONS: Record<ActivityFeed['items'][number]['type'], IconName> = {
  payment: 'card',
  signup: 'user-plus',
  upgrade: 'trend-up',
  refund: 'arrow-down',
  cancellation: 'close-circle',
}

/**
 * Status is carried by a text badge, never by colour alone.
 * WCAG 1.4.1: colour must not be the only visual means of conveying meaning.
 */
function activityTypeLabel(type: ActivityFeed['items'][number]['type']): string {
  if (type === 'payment') return t('dash_activity_type_payment')
  if (type === 'signup') return t('dash_activity_type_signup')
  if (type === 'upgrade') return t('dash_activity_type_upgrade')
  if (type === 'refund') return t('dash_activity_type_refund')
  return t('dash_activity_type_cancellation')
}

function activityStatusLabel(status: ActivityFeed['items'][number]['status']): string {
  if (status === 'succeeded') return t('common_status_succeeded')
  if (status === 'pending') return t('common_status_pending')
  return t('common_status_failed')
}

const STATUS_VARIANT: Record<
  ActivityFeed['items'][number]['status'],
  'success' | 'warning' | 'error'
> = {
  succeeded: 'success',
  pending: 'warning',
  failed: 'error',
}
</script>

<template>
  <UiPanel
    :title="t('dash_activity_title')"
    :description="t('dash_activity_desc')"
    :loading="loading"
    :error="error"
    :updating="updating"
    :empty="isEmpty"
    :empty-title="t('dash_activity_empty_title')"
    :empty-description="t('dash_activity_empty_body')"
    content-class="min-h-64 p-0"
    @retry="emit('retry')"
  >
    <!--
      A real <table>: this is tabular data, and a table gives screen-reader
      users header association and row/column navigation that a list of divs
      cannot.
    -->
    <!--
      A scrollable container must be reachable by keyboard, or its overflowing
      content simply cannot be scrolled to without a mouse (WCAG 2.1.1).
      `tabindex="0"` makes it focusable and arrow-key scrollable; the role and
      label explain what the stop is once you land on it.
    -->
    <div
      class="min-w-0 overflow-x-auto focus-visible:outline-none"
      tabindex="0"
      role="region"
      :aria-label="t('dash_activity_title')"
    >
      <table class="w-full text-sm">
        <caption class="sr-only">
          {{
            t('dash_activity_title')
          }}
        </caption>
        <thead>
          <tr class="border-border border-b">
            <th scope="col" class="text-muted-foreground px-4 py-2 text-start font-medium">
              {{ t('dash_activity_event') }}
            </th>
            <th scope="col" class="text-muted-foreground px-4 py-2 text-start font-medium">
              {{ t('common_status') }}
            </th>
            <th scope="col" class="text-muted-foreground px-4 py-2 text-end font-medium">
              {{ t('common_amount') }}
            </th>
            <th scope="col" class="text-muted-foreground px-4 py-2 text-end font-medium">
              {{ t('common_when') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in items"
            :key="item.id"
            class="border-border hover:bg-muted/60 border-b transition-colors last:border-b-0"
          >
            <th scope="row" class="px-4 py-3 text-start font-normal">
              <span class="flex items-center gap-2.5">
                <span
                  class="bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                >
                  <span
                    :class="[resolveIcon(TYPE_ICONS[item.type]), 'text-muted-foreground h-4 w-4']"
                    aria-hidden="true"
                  />
                </span>
                <span class="min-w-0">
                  <span class="text-foreground block truncate font-medium">{{ item.actor }}</span>
                  <span class="text-muted-foreground block text-xs">
                    {{ activityTypeLabel(item.type) }}
                  </span>
                </span>
              </span>
            </th>
            <td class="px-4 py-3">
              <UiBadge :variant="STATUS_VARIANT[item.status]" size="sm">
                {{ activityStatusLabel(item.status) }}
              </UiBadge>
            </td>
            <td class="text-foreground px-4 py-3 text-end tabular-nums">
              {{ item.amount ? currency(item.amount.amount, item.amount.currency) : '—' }}
            </td>
            <td class="text-muted-foreground px-4 py-3 text-end">
              <!-- `title` exposes the absolute time; relative alone is imprecise. -->
              <time :datetime="item.occurredAt" :title="dateTime(item.occurredAt)">
                {{ relativeTime(item.occurredAt) }}
              </time>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </UiPanel>
</template>
