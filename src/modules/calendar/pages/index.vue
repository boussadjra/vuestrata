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
import { intlLocale } from '@/plugins/appearance'

import { useCalendarMonth } from '../composables/useCalendarMonth'
import { eventKindVariant } from '../presentation'
import { EVENT_KINDS } from '../types'

const { t } = useI18n()
const { current: locale } = useLocales()
const { time, dateTime } = useFormatters()

// The month view's state machine — which month, which day, how the arrows move
// through the grid, and which events land in which cell — belongs to the
// calendar feature, not to this route.
const {
  viewMonth,
  selectedKey,
  kind,
  grid,
  weekdays,
  eventsOn,
  selectedEvents,
  isPending,
  isError,
  refetch,
  shiftMonth,
  selectDay,
  goToToday,
  moveSelection,
} = useCalendarMonth(locale)

const monthLabel = computed(() =>
  new Intl.DateTimeFormat(intlLocale(locale.value), { month: 'long', year: 'numeric' }).format(
    viewMonth.value,
  ),
)

const selectedDayLabel = computed(() => fullDate(selectedKey.value))

const kindOptions = computed(() => [
  { label: t('common_all'), value: 'all' },
  ...EVENT_KINDS.map((value) => ({ label: t(`calendar_kind_${value}`), value })),
])

function fullDate(key: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale.value), { dateStyle: 'full' }).format(
    new Date(`${key}T00:00:00`),
  )
}

function onGridKey(event: KeyboardEvent) {
  if (moveSelection(event.key)) event.preventDefault()
}

/** Full spoken label for a cell — the date, then what is on it. */
function cellLabel(key: string, count: number): string {
  const spoken = fullDate(key)
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
                  :aria-label="cellLabel(day.key, eventsOn(day.key).length)"
                  :aria-current="day.isToday ? 'date' : undefined"
                  :aria-pressed="day.key === selectedKey"
                  :class="[
                    'flex h-20 w-full flex-col items-start gap-1 rounded-[var(--shape-radius-sm)] p-1.5 text-start transition-colors',
                    day.inMonth ? 'text-foreground' : 'text-subtle-foreground',
                    day.key === selectedKey
                      ? 'bg-primary-solid text-primary-foreground'
                      : 'hover:bg-muted',
                  ]"
                  @click="selectDay(day.key)"
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
                    v-if="eventsOn(day.key).length"
                    class="flex flex-wrap gap-0.5"
                    aria-hidden="true"
                  >
                    <span
                      v-for="dot in Math.min(eventsOn(day.key).length, 3)"
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
        <h2 class="text-foreground text-base font-semibold">{{ selectedDayLabel }}</h2>

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
              <UiBadge :variant="eventKindVariant(event.kind)" size="sm">
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
