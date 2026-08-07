<script setup lang="ts">
/**
 * Team directory — the people-grid pattern.
 *
 * Grouped by department rather than presented as one flat list, because
 * "who works on X" is the question a directory is actually asked. Each group is
 * a labelled section, so a screen reader can jump between departments by
 * heading instead of walking twenty-four cards.
 */
import { useI18n } from 'vue-i18n'

import {
  UiAvatar,
  UiBadge,
  UiButton,
  UiCard,
  UiEmptyState,
  UiPageHeader,
  UiSearchField,
  UiSelect,
  UiSkeleton,
} from '@/components/ui'
import { useLocales } from '@/composables/useLocales'

import { useTeamQuery } from '../composables/useTeam'
import { TEAM_DEPARTMENTS, type TeamDepartment, type TeamFilters, type TeamMember } from '../types'

const { t } = useI18n()
const { current: locale } = useLocales()

const search = ref('')
const department = ref<TeamDepartment | 'all'>('all')
const debouncedSearch = refDebounced(search, 300)

const filters = computed<TeamFilters>(() => ({
  search: debouncedSearch.value || undefined,
  department: department.value,
  // The whole directory fits on one page; paging twenty-four people is friction
  // with no benefit.
  pageSize: 100,
  sortBy: 'name',
  sortOrder: 'asc',
}))

const { items, isPending, isError, refetch } = useTeamQuery(filters)

const departmentOptions = computed(() => [
  { label: t('common_all'), value: 'all' },
  ...TEAM_DEPARTMENTS.map((value) => ({ label: t(`team_department_${value}`), value })),
])

/** Members bucketed by department, in the registry's order. */
const groups = computed(() =>
  TEAM_DEPARTMENTS.map((key) => ({
    key,
    label: t(`team_department_${key}`),
    members: items.value.filter((member) => member.department === key),
  })).filter((group) => group.members.length > 0),
)

const STATUS_VARIANT: Record<TeamMember['status'], 'success' | 'warning' | 'default'> = {
  available: 'success',
  busy: 'warning',
  away: 'default',
  on_leave: 'default',
}

/**
 * The member's current local time.
 *
 * The single most useful thing a distributed-team directory can show, and one
 * `Intl` call: it answers "can I ping them now" without any mental arithmetic.
 * Falls back to nothing rather than to a wrong time if the zone is unknown.
 */
function localTime(timezone: string): string | null {
  try {
    return new Intl.DateTimeFormat(locale.value, {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
    }).format(new Date())
  } catch {
    return null
  }
}
</script>

<template>
  <div class="space-y-6">
    <UiPageHeader :title="t('team_title')" :description="t('team_subtitle')">
      <template #actions>
        <UiSearchField
          v-model="search"
          class="min-w-56"
          :placeholder="t('team_search_placeholder')"
          :aria-label="t('team_search_placeholder')"
        />
        <UiSelect
          v-model="department"
          class="min-w-44"
          :options="departmentOptions"
          :aria-label="t('team_filter_department')"
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
      class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      aria-busy="true"
      :aria-label="t('common_loading')"
    >
      <UiSkeleton v-for="index in 6" :key="index" class="h-40" />
    </div>

    <UiEmptyState
      v-else-if="items.length === 0"
      icon="users"
      :title="t('team_empty_title')"
      :description="t('team_empty_body')"
    />

    <section v-for="group in groups" v-else :key="group.key" :aria-labelledby="`dept-${group.key}`">
      <h2
        :id="`dept-${group.key}`"
        class="text-foreground mb-3 text-sm font-semibold tracking-wide uppercase"
      >
        {{ group.label }}
        <span class="text-muted-foreground font-normal tabular-nums"
          >({{ group.members.length }})</span
        >
      </h2>

      <ul class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <li v-for="member in group.members" :key="member.id">
          <UiCard class="flex h-full gap-4 p-4">
            <UiAvatar :fallback="member.name" size="lg" />

            <div class="min-w-0 grow">
              <h3 class="text-foreground truncate font-medium">
                <RouterLink
                  :to="`/dashboard/team/${member.id}`"
                  class="hover:text-link-hover hover:underline"
                >
                  {{ member.name }}
                </RouterLink>
              </h3>
              <p class="text-muted-foreground truncate text-sm">{{ member.title }}</p>

              <div class="mt-2 flex flex-wrap items-center gap-1.5">
                <UiBadge :variant="STATUS_VARIANT[member.status]" size="sm">
                  {{ t(`team_status_${member.status}`) }}
                </UiBadge>
                <!-- Local time answers "is it reasonable to ping them" without
                     the reader doing timezone arithmetic. -->
                <span
                  v-if="localTime(member.timezone)"
                  class="text-muted-foreground text-xs tabular-nums"
                >
                  {{ localTime(member.timezone) }} · {{ member.location }}
                </span>
              </div>
            </div>
          </UiCard>
        </li>
      </ul>
    </section>
  </div>
</template>
