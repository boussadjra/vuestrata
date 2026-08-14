<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { UiPanel } from '@/components/ui'
import { useFormatters } from '@/composables/useFormatters'
import { resolveIcon } from '~/config/icon-provider'
import type { IconName } from '~/types'

import type { UpcomingEvents } from '../types/dashboard'

const props = defineProps<{
  data: UpcomingEvents | undefined
  loading: boolean
  error: boolean
  updating?: boolean
}>()

const emit = defineEmits<{ retry: [] }>()

const { t } = useI18n()
const { date, dateTime, relativeTime } = useFormatters()

const events = computed(() => props.data?.events ?? [])
const isEmpty = computed(() => events.value.length === 0)

const KIND_ICONS: Record<UpcomingEvents['events'][number]['kind'], IconName> = {
  release: 'rocket',
  review: 'document',
  maintenance: 'settings',
  meeting: 'users',
}

function eventKindLabel(kind: UpcomingEvents['events'][number]['kind']): string {
  if (kind === 'release') return t('dash_event_kind_release')
  if (kind === 'review') return t('dash_event_kind_review')
  if (kind === 'maintenance') return t('dash_event_kind_maintenance')
  return t('dash_event_kind_meeting')
}
</script>

<template>
  <UiPanel
    :title="t('dash_upcoming_title')"
    :description="t('dash_upcoming_desc')"
    :loading="loading"
    :error="error"
    :updating="updating"
    :empty="isEmpty"
    :empty-title="t('dash_upcoming_empty_title')"
    content-class="min-h-56"
    @retry="emit('retry')"
  >
    <ol class="space-y-3">
      <li v-for="event in events" :key="event.id" class="flex items-start gap-3">
        <!--
          The date block is one unit, so a screen reader reads "12 March"
          rather than "12" then "March" as separate items.
        -->
        <span
          class="bg-muted text-foreground flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-[var(--shape-radius-sm)] leading-none"
          aria-hidden="true"
        >
          <span class="text-sm font-bold">{{ date(event.startsAt, { day: 'numeric' }) }}</span>
          <span class="text-muted-foreground mt-0.5 text-[10px] uppercase">
            {{ date(event.startsAt, { month: 'short' }) }}
          </span>
        </span>

        <span class="min-w-0 flex-1">
          <span class="text-foreground flex items-center gap-1.5 text-sm font-medium">
            <span
              :class="[
                resolveIcon(KIND_ICONS[event.kind]),
                'text-muted-foreground h-3.5 w-3.5 shrink-0',
              ]"
              aria-hidden="true"
            />
            <span class="line-clamp-2">{{ event.title }}</span>
          </span>
          <time :datetime="event.startsAt" class="text-muted-foreground mt-0.5 block text-xs">
            {{ dateTime(event.startsAt) }} · {{ relativeTime(event.startsAt) }}
          </time>
        </span>

        <span class="sr-only">{{ eventKindLabel(event.kind) }}</span>
      </li>
    </ol>
  </UiPanel>
</template>
