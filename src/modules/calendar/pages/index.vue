<script setup lang="ts">
/**
 * Calendar — the month-grid pattern.
 *
 * The grid is a real `<table>` with weekday column headers, which is what makes
 * a calendar navigable by screen reader: each cell is announced with its
 * weekday, and the date is a heading rather than a loose number. Roving
 * `tabindex` gives it one tab stop and arrow-key movement inside, the pattern
 * users already know from every native date picker.
 */
import { useI18n } from 'vue-i18n'

import { UiBadge, UiButton, UiCard, UiEmptyState, UiPageHeader, UiSelect } from '@/components/ui'
import { useFormatters } from '@/composables/useFormatters'
import { useLocales } from '@/composables/useLocales'
import { resolveIcon } from '@/config/icon-provider'

import { useEventsQuery } from '../composables/useCalendar'
import {
  buildMonthGrid,
  horizontalStep,
  monthRange,
  toDateKey,
  weekdayLabels,
} from '../composables/useMonthGrid'
import { EVENT_KINDS, type CalendarEvent, type CalendarFilters, type EventKind } from '../types'

const { t } = useI18n()
const { current: locale } = useLocales()
const { time, dateTime } = useFormatters()

// First of the month, so month arithmetic never lands on the 31st of a month
// that has 30 days and silently skips one.
const viewMonth = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
const selectedKey = ref(toDateKey(new Date()))
const kind = ref<EventKind | 'all'>('all')

const grid = computed(() => buildMonthGrid(viewMonth.value, locale.value))
const weekdays = computed(() => weekdayLabels(locale.value))

const monthLabel = computed(() =>
  new Intl.DateTimeFormat(locale.value, { month: 'long', year: 'numeric' }).format(viewMonth.value),
)

const filters = computed<CalendarFilters>(() => ({
  ...monthRange(viewMonth.value, locale.value),
  kind: kind.value,
  // The grid is six weeks; no month has more events than this, and paginating a
  // calendar is not a concept.
  pageSize: 100,
  sortBy: 'startsAt',
  sortOrder: 'asc',
}))

const { items, isPending, isError, refetch } = useEventsQuery(filters)

/** Events bucketed by local ISO date, so a cell lookup is O(1). */
const eventsByDay = computed(() => {
  const map = new Map<string, CalendarEvent[]>()
  for (const event of items.value) {
    const key = toDateKey(new Date(event.startsAt))
    const bucket = map.get(key)
    if (bucket) bucket.push(event)
    else map.set(key, [event])
  }
  return map
})

const selectedEvents = computed(() => eventsByDay.value.get(selectedKey.value) ?? [])

const kindOptions = computed(() => [
  { label: t('common_all'), value: 'all' },
  ...EVENT_KINDS.map((value) => ({ label: t(`calendar_kind_${value}`), value })),
])

const KIND_VARIANT: Record<EventKind, 'primary' | 'warning' | 'secondary' | 'error' | 'default'> = {
  meeting: 'primary',
  deadline: 'error',
  review: 'secondary',
  maintenance: 'warning',
  holiday: 'default',
}

function shiftMonth(delta: number) {
  const next = new Date(viewMonth.value)
  next.setMonth(next.getMonth() + delta)
  viewMonth.value = next
}

function goToToday() {
  const now = new Date()
  viewMonth.value = new Date(now.getFullYear(), now.getMonth(), 1)
  selectedKey.value = toDateKey(now)
}

/**
 * Arrow-key movement across the grid.
 *
 * Moving past the first or last cell pulls the view to the adjacent month
 * rather than stopping dead — the alternative is a user pressing ArrowRight on
 * the 31st and nothing happening, with no indication why.
 */
function onGridKey(event: KeyboardEvent) {
  const steps: Record<string, number> = {
    ArrowLeft: horizontalStep('ArrowLeft', locale.value),
    ArrowRight: horizontalStep('ArrowRight', locale.value),
    ArrowUp: -7,
    ArrowDown: 7,
  }
  const step = steps[event.key]
  if (step === undefined) return

  event.preventDefault()
  const current = new Date(`${selectedKey.value}T00:00:00`)
  current.setDate(current.getDate() + step)
  selectedKey.value = toDateKey(current)

  if (current.getMonth() !== viewMonth.value.getMonth()) {
    viewMonth.value = new Date(current.getFullYear(), current.getMonth(), 1)
  }
}

/** Full spoken label for a cell — the date, then what is on it. */
function cellLabel(key: string, count: number): string {
  const spoken = new Intl.DateTimeFormat(locale.value, { dateStyle: 'full' }).format(
    new Date(`${key}T00:00:00`),
  )
  return count === 0 ? spoken : `${spoken}, ${t('calendar_event_count', { count })}`
}
</script>

<template>
  <div class="space-y-6">
    <UiPageHeader :title="t('calendar_title')" :description="t('calendar_subtitle')">
      <template #actions>
        <UiSelect
          v-model="kind"
          class="min-w-40"
          :options="kindOptions"
          :aria-label="t('calendar_filter_kind')"
        />
        <UiButton variant="ghost" @click="goToToday">{{ t('common_today') }}</UiButton>
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

    <div v-else class="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <UiCard class="p-4">
        <div class="mb-4 flex items-center justify-between gap-3">
          <UiButton
            variant="ghost"
            icon
            :aria-label="t('calendar_previous_month')"
            @click="shiftMonth(-1)"
          >
            <span
              :class="[resolveIcon('arrow-left'), 'h-4 w-4 rtl:rotate-180']"
              aria-hidden="true"
            />
          </UiButton>
          <!-- `aria-live` so a screen reader hears the new month after the
               arrows are pressed; the grid below changes silently otherwise. -->
          <h2 class="text-foreground text-lg font-semibold" aria-live="polite">
            {{ monthLabel }}
          </h2>
          <UiButton
            variant="ghost"
            icon
            :aria-label="t('calendar_next_month')"
            @click="shiftMonth(1)"
          >
            <span
              :class="[resolveIcon('arrow-right'), 'h-4 w-4 rtl:rotate-180']"
              aria-hidden="true"
            />
          </UiButton>
        </div>

        <table class="w-full table-fixed border-collapse" @keydown="onGridKey">
          <caption class="sr-only">
            {{
              t('calendar_grid_caption', { month: monthLabel })
            }}
          </caption>
          <thead>
            <tr>
              <th
                v-for="weekday in weekdays"
                :key="weekday"
                scope="col"
                class="text-muted-foreground pb-2 text-center text-xs font-medium"
              >
                {{ weekday }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="week in 6" :key="week">
              <td v-for="day in grid.slice((week - 1) * 7, week * 7)" :key="day.key" class="p-0.5">
                <!--
                  Roving tabindex: exactly one cell is in the tab order, and the
                  arrow keys move the selection. A grid where all 42 cells are
                  tabbable costs a keyboard user 42 presses to get past it.
                -->
                <button
                  type="button"
                  :tabindex="day.key === selectedKey ? 0 : -1"
                  :aria-label="cellLabel(day.key, eventsByDay.get(day.key)?.length ?? 0)"
                  :aria-current="day.isToday ? 'date' : undefined"
                  :aria-pressed="day.key === selectedKey"
                  :class="[
                    'flex h-20 w-full flex-col items-start gap-1 rounded-[var(--shape-radius-sm)] p-1.5 text-start transition-colors',
                    day.inMonth ? 'text-foreground' : 'text-subtle-foreground',
                    day.key === selectedKey
                      ? 'bg-primary-solid text-primary-foreground'
                      : 'hover:bg-muted',
                  ]"
                  @click="selectedKey = day.key"
                >
                  <span
                    :class="[
                      'text-xs tabular-nums',
                      day.isToday && day.key !== selectedKey ? 'text-link font-bold' : '',
                    ]"
                  >
                    {{ day.dayOfMonth }}
                  </span>

                  <!--
                    Dots are decorative — the count is already in the cell's
                    accessible name, so repeating it here would make a screen
                    reader read every day twice.
                  -->
                  <span
                    v-if="eventsByDay.get(day.key)?.length"
                    class="flex flex-wrap gap-0.5"
                    aria-hidden="true"
                  >
                    <span
                      v-for="dot in Math.min(eventsByDay.get(day.key)!.length, 3)"
                      :key="dot"
                      :class="[
                        'h-1.5 w-1.5 rounded-full',
                        day.key === selectedKey ? 'bg-primary-foreground' : 'bg-primary-solid',
                      ]"
                    />
                  </span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </UiCard>

      <UiCard class="p-5">
        <h2 class="text-foreground text-base font-semibold">
          {{
            new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(
              new Date(`${selectedKey}T00:00:00`),
            )
          }}
        </h2>

        <p v-if="isPending" class="text-muted-foreground mt-4 text-sm" aria-busy="true">
          {{ t('common_loading') }}
        </p>

        <p v-else-if="selectedEvents.length === 0" class="text-muted-foreground mt-4 text-sm">
          {{ t('calendar_day_empty') }}
        </p>

        <ul v-else class="mt-4 space-y-3">
          <li
            v-for="event in selectedEvents"
            :key="event.id"
            class="border-border border-b pb-3 last:border-b-0"
          >
            <div class="flex items-start justify-between gap-2">
              <h3 class="text-foreground text-sm font-medium">{{ event.title }}</h3>
              <UiBadge :variant="KIND_VARIANT[event.kind]" size="sm">
                {{ t(`calendar_kind_${event.kind}`) }}
              </UiBadge>
            </div>
            <p class="text-muted-foreground mt-1 text-xs">
              <time :datetime="event.startsAt" :title="dateTime(event.startsAt)">
                {{ event.allDay ? t('calendar_all_day') : time(event.startsAt) }}
              </time>
              <template v-if="!event.allDay">
                –
                <time :datetime="event.endsAt">{{ time(event.endsAt) }}</time>
              </template>
              <span v-if="event.location"> · {{ event.location }}</span>
            </p>
            <p v-if="event.attendees.length" class="text-muted-foreground mt-1 text-xs">
              {{ t('calendar_attendees', { count: event.attendees.length }) }}:
              {{ event.attendees.join(', ') }}
            </p>
          </li>
        </ul>
      </UiCard>
    </div>
  </div>
</template>
