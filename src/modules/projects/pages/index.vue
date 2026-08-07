<script setup lang="ts">
/**
 * Projects list.
 *
 * Each row leads to its board. Health is a worded badge rather than the
 * red/amber/green dot this kind of table usually gets — RAG status is the
 * canonical example of information carried entirely by colour.
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

import { useProjectsQuery } from '../composables/useProjects'
import { PROJECT_HEALTHS, type ProjectFilters, type ProjectHealth } from '../types'

const { t } = useI18n()
const { date, number } = useFormatters()

const health = ref<ProjectHealth | 'all'>('all')

const filters = computed<ProjectFilters>(() => ({
  pageSize: 50,
  health: health.value,
  sortBy: 'dueAt',
  sortOrder: 'asc',
}))

const { items, isPending, isError, refetch } = useProjectsQuery(filters)

const healthOptions = computed(() => [
  { label: t('common_all'), value: 'all' },
  ...PROJECT_HEALTHS.map((value) => ({ label: t(`projects_health_${value}`), value })),
])

const HEALTH_VARIANT: Record<ProjectHealth, 'success' | 'warning' | 'error'> = {
  on_track: 'success',
  at_risk: 'warning',
  off_track: 'error',
}
</script>

<template>
  <div class="space-y-6">
    <UiPageHeader :title="t('projects_title')" :description="t('projects_subtitle')">
      <template #actions>
        <UiSelect
          v-model="health"
          class="min-w-44"
          :options="healthOptions"
          :aria-label="t('projects_filter_health')"
        />
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
      class="grid gap-4 lg:grid-cols-2"
      aria-busy="true"
      :aria-label="t('common_loading')"
    >
      <UiSkeleton v-for="index in 4" :key="index" class="h-44" />
    </div>

    <UiEmptyState
      v-else-if="items.length === 0"
      icon="folder"
      :title="t('projects_empty_title')"
      :description="t('projects_empty_body')"
    />

    <ul v-else class="grid gap-4 lg:grid-cols-2">
      <li v-for="project in items" :key="project.id">
        <UiCard class="flex h-full flex-col p-5">
          <div class="flex items-start justify-between gap-3">
            <h2 class="text-foreground min-w-0 font-semibold">
              <RouterLink
                :to="`/dashboard/projects/${project.id}`"
                class="hover:text-link-hover hover:underline"
              >
                {{ project.name }}
              </RouterLink>
            </h2>
            <UiBadge :variant="HEALTH_VARIANT[project.health]" size="sm">
              {{ t(`projects_health_${project.health}`) }}
            </UiBadge>
          </div>

          <p class="text-muted-foreground mt-2 grow text-sm">{{ project.description }}</p>

          <div class="mt-4">
            <UiProgress
              :value="project.progress"
              :label="t('projects_progress', { percent: project.progress })"
            />
          </div>

          <dl class="text-muted-foreground mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs">
            <div class="flex gap-1.5">
              <dt>{{ t('projects_lead') }}:</dt>
              <dd class="text-foreground">{{ project.lead }}</dd>
            </div>
            <div class="flex gap-1.5">
              <dt>{{ t('projects_open_tasks') }}:</dt>
              <dd class="text-foreground tabular-nums">
                {{ number(project.openTaskCount) }} / {{ number(project.taskCount) }}
              </dd>
            </div>
            <div class="flex gap-1.5">
              <dt>{{ t('common_due_date') }}:</dt>
              <dd class="text-foreground">
                <time :datetime="project.dueAt">{{ date(project.dueAt) }}</time>
              </dd>
            </div>
          </dl>
        </UiCard>
      </li>
    </ul>
  </div>
</template>
