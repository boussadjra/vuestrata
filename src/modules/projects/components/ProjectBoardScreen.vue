<script setup lang="ts">
/**
 * Project board — the kanban pattern.
 *
 * Cards move by an explicit control, not by drag-and-drop.
 *
 * This is deliberate. A pointer-drag board is unusable by keyboard, by screen
 * reader, and by anyone with a motor impairment, and the accessible fallback
 * every DnD library recommends is exactly this: a menu on the card that names
 * the destination columns. Building the fallback first means the board works
 * for everyone; drag can be layered on later as an enhancement, and the moment
 * it is, the underlying mutation already exists.
 *
 * The screen takes a project id, never a route. It is the whole board
 * experience, independent of the URL that happens to lead here.
 */
import { useI18n } from 'vue-i18n'

import {
  UiBadge,
  UiButton,
  UiCard,
  UiEmptyState,
  UiPageHeader,
  UiProgress,
  UiSelect,
  UiSkeleton,
} from '@/components/ui'
import { useFormatters } from '@/composables/useFormatters'
import { useRbac } from '@/composables/useRbac'
import { resolveIcon } from '@/config/icon-provider'

import { isTaskOverdue, moveDestinations, toTaskStatus } from '../board'
import { useProjectBoard } from '../composables/useProjectBoard'
import { taskPriorityVariant } from '../presentation'
import type { Task } from '../types'

const props = defineProps<{ projectId: string | undefined }>()

const { t } = useI18n()
const { can } = useRbac()
const { date } = useFormatters()

const { project, columns, isPending, isError, refetch, move } = useProjectBoard(
  () => props.projectId,
)

/** Destination options for a card, excluding the column it is already in. */
function destinationsFor(task: Task) {
  return moveDestinations(task).map((status) => ({
    label: t('projects_move_to', { column: t(`projects_status_${status}`) }),
    value: status,
  }))
}

function onMove(task: Task, value: string | number | (string | number)[]) {
  const target = toTaskStatus(value)
  if (target) move(task, target)
}
</script>

<template>
  <div class="space-y-6">
    <UiPageHeader
      :title="project?.name ?? t('projects_board_title')"
      :description="project?.description"
    >
      <template v-if="project" #meta>
        <div class="mt-3 max-w-md">
          <UiProgress
            :value="project.progress"
            :label="t('projects_progress', { percent: project.progress })"
          />
        </div>
      </template>
      <template #actions>
        <UiButton to="/dashboard/projects" variant="ghost">
          <span :class="[resolveIcon('arrow-left'), 'h-4 w-4 rtl:rotate-180']" aria-hidden="true" />
          {{ t('projects_back_to_list') }}
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

    <div
      v-else-if="isPending"
      class="grid gap-4 lg:grid-cols-4"
      aria-busy="true"
      :aria-label="t('common_loading')"
    >
      <UiSkeleton v-for="index in 4" :key="index" class="h-96" />
    </div>

    <!--
      The board scrolls horizontally on narrow screens rather than reflowing to
      one column: the columns ARE the information, and stacking them loses the
      comparison the board exists to make. `tabindex` makes the scroll region
      reachable without a mouse (WCAG 2.1.1).
    -->
    <div
      v-else
      class="grid gap-4 overflow-x-auto pb-2 md:grid-cols-2 lg:grid-cols-4"
      tabindex="0"
      role="region"
      :aria-label="t('projects_board_title')"
    >
      <section
        v-for="column in columns"
        :key="column.status"
        class="bg-muted/60 flex min-w-64 flex-col rounded-[var(--shape-radius-sm)] p-3"
        :aria-labelledby="`column-${column.status}`"
      >
        <h2
          :id="`column-${column.status}`"
          class="text-foreground mb-3 flex items-center justify-between text-sm font-semibold"
        >
          {{ t(`projects_status_${column.status}`) }}
          <!-- The count is inside the heading so it is announced with the
               column name rather than as a stray number after it. -->
          <span class="text-muted-foreground tabular-nums">{{ column.tasks.length }}</span>
        </h2>

        <p
          v-if="column.tasks.length === 0"
          class="text-muted-foreground px-1 py-6 text-center text-sm"
        >
          {{ t('projects_column_empty') }}
        </p>

        <ul v-else class="space-y-2">
          <li v-for="task in column.tasks" :key="task.id">
            <UiCard class="space-y-2 p-3">
              <p class="text-foreground text-sm font-medium">{{ task.title }}</p>

              <div class="flex flex-wrap items-center gap-1.5">
                <UiBadge :variant="taskPriorityVariant(task.priority)" size="sm">
                  {{ t(`projects_priority_${task.priority}`) }}
                </UiBadge>
                <!--
                  Overdue is stated in words, not signalled by a red border.
                  Colour alone would leave the single most important fact on the
                  card invisible to a screen reader (WCAG 1.4.1).
                -->
                <UiBadge v-if="isTaskOverdue(task)" variant="error" size="sm">
                  {{ t('projects_overdue') }}
                </UiBadge>
              </div>

              <div class="text-muted-foreground flex items-center justify-between gap-2 text-xs">
                <span class="truncate">{{ task.assignee ?? t('common_unassigned') }}</span>
                <time v-if="task.dueAt" :datetime="task.dueAt" class="shrink-0 tabular-nums">
                  {{ date(task.dueAt) }}
                </time>
              </div>

              <!--
                The select's accessible name includes the task title, so a
                screen reader user moving through a column of eight cards hears
                which one each control belongs to instead of "Move to" eight
                times.
              -->
              <UiSelect
                v-if="can('projects:manage')"
                :model-value="''"
                :options="destinationsFor(task)"
                :placeholder="t('projects_move')"
                :aria-label="t('projects_move_task', { title: task.title })"
                size="sm"
                @update:model-value="(value) => onMove(task, value)"
              />
            </UiCard>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
